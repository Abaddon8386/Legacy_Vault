package com.legacyvault.beneficiary;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import com.legacyvault.verification.service.StaffVaultCaseGuard;

import jakarta.persistence.EntityManager;

/**
 * BE-01 (Staff side): confirm or reject a recipient's link request at the counter.
 * The account to link is always the stored requester of the request; the body only names the recipient.
 * Lock order matches the other linkers: account -> Vault -> case -> request -> recipient. Approval, link, role,
 * invitation revocation and audit run in one transaction, so any failure leaves nothing half-applied.
 * Two requests racing for one recipient: the second approval sees the recipient already linked
 * (BENEFICIARY_ACCOUNT_ALREADY_LINKED) and its request stays PENDING for Staff to reject.
 *
 * <p>Gọi từ {@code StaffLinkRequestController}. Bảng: {@code beneficiary_link_requests}, {@code beneficiaries}, {@code users}.
 * Audit {@code BENEFICIARY_LINK_REQUEST_APPROVED}, {@code BENEFICIARY_LINK_REQUEST_REJECTED} và {@code BENEFICIARY_ACCOUNT_LINKED}
 * (qua {@code BeneficiaryAccountService.attach}).
 */
@Service
public class StaffLinkRequestService {

	private final BeneficiaryLinkRequestRepository requests;
	private final BeneficiaryRepository beneficiaries;
	private final StaffCaseLockRepository caseLookup;
	private final StaffVaultCaseGuard caseGuard;
	private final StaffContextService staff;
	private final UserRepository users;
	private final BeneficiaryAccountService accountLinker;
	private final AuditService audit;
	private final EntityManager entities;

	/**
	 * Hàm khởi tạo, Spring tiêm các phụ thuộc.
	 */
	public StaffLinkRequestService(BeneficiaryLinkRequestRepository requests, BeneficiaryRepository beneficiaries,
			StaffCaseLockRepository caseLookup, StaffVaultCaseGuard caseGuard, StaffContextService staff,
			UserRepository users, BeneficiaryAccountService accountLinker, AuditService audit, EntityManager entities) {
		this.requests = requests;
		this.beneficiaries = beneficiaries;
		this.caseLookup = caseLookup;
		this.caseGuard = caseGuard;
		this.staff = staff;
		this.users = users;
		this.accountLinker = accountLinker;
		this.audit = audit;
		this.entities = entities;
	}

	/**
	 * Liệt kê yêu cầu còn chờ và chưa hết hạn của case, kèm tên và email của tài khoản yêu cầu. Endpoint {@code GET .../link-requests}.
	 * @throws com.legacyvault.common.error.BusinessException {@code RESOURCE_NOT_FOUND}
	 */
	@Transactional(readOnly = true)
	public List<BeneficiaryLinkRequestDtos.StaffRequest> listPending(UUID caseId) {
		User actor = staff.requireStaff();
		VerificationCase target = ownedOpenCase(caseId, actor);
		LocalDateTime now = now();
		return requests.findByVerificationCaseIdAndStatusOrderByCreatedAtAsc(target.getVerificationCaseId(),
				BeneficiaryLinkRequest.PENDING).stream().filter(r -> r.isOpen(now)).map(r -> {
					User requester = users.findById(r.getRequesterUserId())
							.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
					return new BeneficiaryLinkRequestDtos.StaffRequest(r.getPublicId(), r.effectiveStatus(now),
							requester.getFullName(), requester.getEmail(),
							r.getCreatedAt().toInstant(ZoneOffset.UTC), r.getExpiresAt().toInstant(ZoneOffset.UTC));
				}).toList();
	}

	/**
	 * Duyệt yêu cầu. Các bước: xác định case đang mở của Staff, khóa tài khoản theo người yêu cầu đã lưu (không lấy từ client), khóa Vault/Case,
	 * khóa dòng yêu cầu và kiểm tra còn chờ, kiểm tra người thụ hưởng đã xác minh, chưa liên kết và tài khoản đủ điều kiện, gọi {@code attach},
	 * đánh dấu APPROVED và audit. Tất cả trong một giao dịch. Endpoint {@code POST .../link-requests/{requestId}/approve}.
	 * @throws com.legacyvault.common.error.BusinessException {@code RESOURCE_NOT_FOUND}, {@code BENEFICIARY_ACCOUNT_INELIGIBLE}, {@code BENEFICIARY_LINK_REQUEST_NOT_PENDING}, {@code BENEFICIARY_IDENTITY_NOT_VERIFIED}, {@code BENEFICIARY_ACCOUNT_ALREADY_LINKED}
	 */
	@Transactional
	public BeneficiaryLinkRequestDtos.Decision approve(UUID caseId, UUID requestId, UUID beneficiaryId) {
		User actor = staff.requireStaff();
		VerificationCase target = ownedOpenCase(caseId, actor);
		BeneficiaryLinkRequest preview = requests.findByPublicId(requestId)
				.filter(r -> r.getVerificationCaseId().equals(target.getVerificationCaseId()))
				.orElseThrow(StaffLinkRequestService::notFound);

		// The target account comes from the stored request, never from the caller.
		User account = users.findActiveAccountForUpdate(preview.getRequesterUserId())
				.orElseThrow(() -> new BusinessException(ErrorCode.BENEFICIARY_ACCOUNT_INELIGIBLE));
		entities.refresh(account);
		caseGuard.requireOpenForWrite(target.getVaultId(), actor.getUserId());
		BeneficiaryLinkRequest request = lockPending(requestId, target);

		Beneficiary beneficiary = beneficiaries.findByPublicIdAndVault_VaultId(beneficiaryId, target.getVaultId())
				.orElseThrow(StaffLinkRequestService::notFound);
		entities.refresh(beneficiary);
		accountLinker.requireUnlinkedVerified(beneficiary);
		accountLinker.requireEligible(beneficiary, account);

		LocalDateTime now = now();
		accountLinker.attach(beneficiary, account, actor, AuditAction.BENEFICIARY_ACCOUNT_LINKED);
		request.approve(beneficiary.getId(), actor.getUserId(), now);
		requests.saveAndFlush(request);
		audit.record(actor.getUserId(), target.getVaultId(), "BENEFICIARY_LINK_REQUEST_APPROVED",
				"BENEFICIARY_LINK_REQUEST", request.getId(), "USER",
				Map.of("requestPublicId", request.getPublicId().toString(),
						"beneficiaryPublicId", beneficiary.getPublicId().toString(),
						"accountPublicId", account.getPublicId().toString(),
						"stateBefore", BeneficiaryLinkRequest.PENDING, "stateAfter", BeneficiaryLinkRequest.APPROVED));
		return new BeneficiaryLinkRequestDtos.Decision(request.getPublicId(), request.getStatus(),
				beneficiary.getPublicId(), account.getPublicId());
	}

	/**
	 * Từ chối yêu cầu đang chờ, audit. Endpoint {@code POST .../link-requests/{requestId}/reject}.
	 * @throws com.legacyvault.common.error.BusinessException {@code RESOURCE_NOT_FOUND}, {@code BENEFICIARY_LINK_REQUEST_NOT_PENDING}
	 */
	@Transactional
	public BeneficiaryLinkRequestDtos.Decision reject(UUID caseId, UUID requestId) {
		User actor = staff.requireStaff();
		VerificationCase target = ownedOpenCase(caseId, actor);
		requests.findByPublicId(requestId).filter(r -> r.getVerificationCaseId().equals(target.getVerificationCaseId()))
				.orElseThrow(StaffLinkRequestService::notFound);
		caseGuard.requireOpenForWrite(target.getVaultId(), actor.getUserId());
		BeneficiaryLinkRequest request = lockPending(requestId, target);
		request.reject(actor.getUserId(), now());
		requests.saveAndFlush(request);
		audit.record(actor.getUserId(), target.getVaultId(), "BENEFICIARY_LINK_REQUEST_REJECTED",
				"BENEFICIARY_LINK_REQUEST", request.getId(), "USER",
				Map.of("requestPublicId", request.getPublicId().toString(),
						"stateBefore", BeneficiaryLinkRequest.PENDING, "stateAfter", BeneficiaryLinkRequest.REJECTED));
		return new BeneficiaryLinkRequestDtos.Decision(request.getPublicId(), request.getStatus(), null, null);
	}

	/** Re-read the request under its row lock: a cancel, expiry or another Staff decision may have won the race. */
	private BeneficiaryLinkRequest lockPending(UUID requestId, VerificationCase target) {
		BeneficiaryLinkRequest request = requests.findByPublicIdForUpdate(requestId)
				.filter(r -> r.getVerificationCaseId().equals(target.getVerificationCaseId()))
				.orElseThrow(StaffLinkRequestService::notFound);
		entities.refresh(request);
		if (!request.isOpen(now())) {
			throw new BusinessException(ErrorCode.BENEFICIARY_LINK_REQUEST_NOT_PENDING);
		}
		return request;
	}

	/**
	 * Tìm case đang mở thuộc Staff; ngược lại ném {@code RESOURCE_NOT_FOUND}.
	 */
	private VerificationCase ownedOpenCase(UUID caseId, User actor) {
		VerificationCase found = caseLookup.findOwnedByStaff(caseId, actor.getUserId())
				.orElseThrow(StaffLinkRequestService::notFound);
		if (!found.isOpen()) throw notFound();
		return found;
	}

	/**
	 * Tạo lỗi {@code RESOURCE_NOT_FOUND}.
	 */
	private static BusinessException notFound() { return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND); }

	/**
	 * Giờ UTC hiện tại.
	 */
	private static LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
}
