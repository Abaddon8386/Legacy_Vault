package com.legacyvault.beneficiary;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.user.entity.Role;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.entity.UserRole;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.user.repository.UserRoleRepository;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.VerificationCaseRepository;

/**
 * BE-01 (phía người nhận): tài khoản đã đăng nhập gửi mã hồ sơ, liệt kê và hủy yêu cầu của chính nó.
 * Gửi chỉ ghi một yêu cầu PENDING; không bao giờ liên kết tài khoản, cấp role hay tiết lộ dữ liệu hồ sơ.
 * Dòng tài khoản được khóa trước (thứ tự User -> Vault dùng ở nơi khác) để kiểm tra trùng/giới hạn được tuần tự hóa
 * theo tài khoản. Mọi mã không dùng được đều nhận cùng một lỗi chung để không dùng mã dò hồ sơ.
 */
@Service
public class BeneficiaryLinkRequestService {

	/** Số yêu cầu PENDING còn hạn tối đa của mỗi tài khoản. */
	static final int MAX_PENDING_PER_ACCOUNT = 5;
	private static final Pattern CASE_CODE = Pattern.compile("^HS-(\\d{4})-(\\d{1,9})$", Pattern.CASE_INSENSITIVE);
	private static final Set<String> INTERNAL_ROLES = Set.of("ROLE_STAFF_EXECUTOR", "ROLE_LEGAL_VERIFIER", "ROLE_ADMIN");

	private final BeneficiaryLinkRequestRepository requests;
	private final VerificationCaseRepository cases;
	private final VaultRepository vaults;
	private final UserRepository users;
	private final UserRoleRepository userRoles;
	private final AuditService audit;
	private final long ttlDays;

	public BeneficiaryLinkRequestService(BeneficiaryLinkRequestRepository requests, VerificationCaseRepository cases,
			VaultRepository vaults, UserRepository users, UserRoleRepository userRoles, AuditService audit,
			@Value("${legacyvault.beneficiary.link-request-ttl-days:7}") long ttlDays) {
		this.requests = requests;
		this.cases = cases;
		this.vaults = vaults;
		this.users = users;
		this.userRoles = userRoles;
		this.audit = audit;
		this.ttlDays = ttlDays;
	}

	/**
	 * Gửi yêu cầu liên kết tài khoản vào một hồ sơ xác minh bằng mã hồ sơ.
	 * Xử lý: khóa dòng tài khoản (tuần tự hóa kiểm tra trùng/giới hạn) -> loại tài khoản nội bộ -> tìm hồ sơ đang mở
	 * -> loại chủ vault -> xử lý yêu cầu PENDING cũ (hết hạn thì đánh dấu EXPIRED) -> kiểm tra giới hạn -> lưu + audit.
	 * @return thông tin yêu cầu cho người gửi (không chứa dữ liệu hồ sơ/vault).
	 */
	@Transactional
	public BeneficiaryLinkRequestDtos.MyRequest submit(Long accountId, String caseCode) {
		User account = lockAccount(accountId);
		if (userRoles.findByUserIdWithRole(accountId).stream().map(UserRole::getRole).map(Role::getRoleCode)
				.anyMatch(INTERNAL_ROLES::contains)) {
			throw invalid();
		}
		VerificationCase target = resolveOpenCase(caseCode);
		if (vaults.findById(target.getVaultId()).map(v -> accountId.equals(v.getOwnerUserId())).orElse(true)) {
			throw invalid();
		}
		LocalDateTime now = now();
		// Yêu cầu PENDING cũ cùng hồ sơ: còn hạn thì từ chối trùng; đã hết hạn thì chuyển EXPIRED và flush để giải phóng ràng buộc trùng trước khi INSERT.
		var existing = requests.findByRequesterUserIdAndVerificationCaseIdAndStatus(accountId,
				target.getVerificationCaseId(), BeneficiaryLinkRequest.PENDING);
		if (existing.isPresent()) {
			if (existing.get().isOpen(now)) {
				throw new BusinessException(ErrorCode.BENEFICIARY_LINK_REQUEST_ALREADY_PENDING);
			}
			existing.get().expire(now);
			requests.saveAndFlush(existing.get());
		}
		if (requests.countByRequesterUserIdAndStatusAndExpiresAtAfter(accountId, BeneficiaryLinkRequest.PENDING, now)
				>= MAX_PENDING_PER_ACCOUNT) {
			throw new BusinessException(ErrorCode.BENEFICIARY_LINK_REQUEST_LIMIT);
		}
		BeneficiaryLinkRequest created;
		try {
			created = requests.saveAndFlush(new BeneficiaryLinkRequest(accountId, target.getVerificationCaseId(),
					now.plusDays(ttlDays)));
		}
		// Hai request đồng thời vượt qua kiểm tra: ràng buộc unique của DB là chốt chặn cuối, quy về lỗi ALREADY_PENDING.
		catch (DataIntegrityViolationException duplicate) {
			throw new BusinessException(ErrorCode.BENEFICIARY_LINK_REQUEST_ALREADY_PENDING);
		}
		audit.record(accountId, target.getVaultId(), "BENEFICIARY_LINK_REQUESTED", "BENEFICIARY_LINK_REQUEST",
				created.getId(), "USER", Map.of("requestPublicId", created.getPublicId().toString(),
						"stateAfter", BeneficiaryLinkRequest.PENDING));
		return BeneficiaryLinkRequestDtos.MyRequest.from(created, now);
	}

	/** Liệt kê yêu cầu của tài khoản (mới nhất trước), trạng thái được tính theo hạn tại thời điểm gọi. */
	@Transactional(readOnly = true)
	public List<BeneficiaryLinkRequestDtos.MyRequest> listMine(Long accountId) {
		LocalDateTime now = now();
		return requests.findByRequesterUserIdOrderByCreatedAtDesc(accountId).stream()
				.map(r -> BeneficiaryLinkRequestDtos.MyRequest.from(r, now)).toList();
	}

	/** Hủy yêu cầu của chính mình. Không phải chủ yêu cầu thì báo NOT_FOUND (tránh lộ sự tồn tại); chỉ hủy được khi còn mở. */
	@Transactional
	public BeneficiaryLinkRequestDtos.MyRequest cancel(Long accountId, UUID requestId) {
		lockAccount(accountId);
		BeneficiaryLinkRequest request = requests.findByPublicIdForUpdate(requestId)
				.filter(r -> accountId.equals(r.getRequesterUserId()))
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		LocalDateTime now = now();
		if (!request.isOpen(now)) {
			throw new BusinessException(ErrorCode.BENEFICIARY_LINK_REQUEST_NOT_PENDING);
		}
		request.cancel(now);
		requests.save(request);
		Long vaultId = cases.findById(request.getVerificationCaseId()).map(VerificationCase::getVaultId).orElse(null);
		audit.record(accountId, vaultId, "BENEFICIARY_LINK_REQUEST_CANCELLED", "BENEFICIARY_LINK_REQUEST",
				request.getId(), "USER", Map.of("requestPublicId", request.getPublicId().toString(),
						"stateBefore", BeneficiaryLinkRequest.PENDING, "stateAfter", BeneficiaryLinkRequest.CANCELLED));
		return BeneficiaryLinkRequestDtos.MyRequest.from(request, now);
	}

	private User lockAccount(Long accountId) {
		return users.findActiveAccountForUpdate(accountId)
				.orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED));
	}

	/** Mã có dạng HS-yyyy-n: n là id hồ sơ và yyyy phải khớp năm tạo. Mọi thứ khác là "không hợp lệ". */
	private VerificationCase resolveOpenCase(String caseCode) {
		Matcher matcher = caseCode == null ? null : CASE_CODE.matcher(caseCode.trim());
		if (matcher == null || !matcher.matches()) throw invalid();
		VerificationCase found = cases.findById(Long.parseLong(matcher.group(2))).orElseThrow(this::invalid);
		// Hồ sơ phải đang mở, đã có Staff phụ trách và năm trong mã khớp năm tạo hồ sơ; mọi trường hợp khác trả cùng lỗi INVALID.
		if (!found.isOpen() || found.getAssignedStaffUserId() == null
				|| found.getCreatedAt().getYear() != Integer.parseInt(matcher.group(1))) {
			throw invalid();
		}
		return found;
	}

	private BusinessException invalid() { return new BusinessException(ErrorCode.BENEFICIARY_LINK_REQUEST_INVALID); }

	private static LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
}
