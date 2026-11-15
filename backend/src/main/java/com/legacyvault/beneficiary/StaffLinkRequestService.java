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
 * BE-01 (phía Staff): xác nhận hoặc từ chối yêu cầu liên kết của người thụ hưởng tại quầy.
 * Tài khoản cần liên kết luôn là người gửi đã lưu của yêu cầu; body chỉ chỉ định người thụ hưởng.
 * Thứ tự khóa giống các luồng liên kết khác: tài khoản -> Vault -> case -> yêu cầu -> người thụ hưởng. Duyệt, liên kết, role,
 * thu hồi lời mời và audit chạy trong một transaction, nên lỗi nào cũng không để lại trạng thái dở dang.
 * Hai yêu cầu đua nhau cho một người thụ hưởng: lần duyệt thứ hai thấy người thụ hưởng đã liên kết
 * (BENEFICIARY_ACCOUNT_ALREADY_LINKED) và yêu cầu của nó vẫn PENDING để Staff từ chối.
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

	/** Liệt kê yêu cầu PENDING còn hạn của hồ sơ Staff phụ trách, cũ nhất trước (kèm tên/email người gửi để đối chiếu tại quầy). */
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
	 * Duyệt yêu cầu: liên kết tài khoản người gửi với người thụ hưởng Staff chọn.
	 * Xử lý: khóa tài khoản -> kiểm tra vault/hồ sơ -> khóa yêu cầu và đọc lại -> kiểm tra người thụ hưởng đã xác minh tại quầy,
	 * chưa liên kết và tài khoản đủ điều kiện -> attach (role, thu hồi mã mời) -> đánh dấu APPROVED -> audit; tất cả trong một transaction.
	 */
	@Transactional
	public BeneficiaryLinkRequestDtos.Decision approve(UUID caseId, UUID requestId, UUID beneficiaryId) {
		User actor = staff.requireStaff();
		VerificationCase target = ownedOpenCase(caseId, actor);
		BeneficiaryLinkRequest preview = requests.findByPublicId(requestId)
				.filter(r -> r.getVerificationCaseId().equals(target.getVerificationCaseId()))
				.orElseThrow(StaffLinkRequestService::notFound);

		// Tài khoản đích lấy từ yêu cầu đã lưu, không bao giờ từ caller.
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

	/** Từ chối yêu cầu đang PENDING của hồ sơ Staff phụ trách; không liên kết gì. */
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

	/** Đọc lại yêu cầu dưới khóa dòng của nó: hủy, hết hạn hoặc quyết định của Staff khác có thể đã thắng cuộc đua. */
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

	private VerificationCase ownedOpenCase(UUID caseId, User actor) {
		VerificationCase found = caseLookup.findOwnedByStaff(caseId, actor.getUserId())
				.orElseThrow(StaffLinkRequestService::notFound);
		if (!found.isOpen()) throw notFound();
		return found;
	}

	private static BusinessException notFound() { return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND); }

	private static LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
}
