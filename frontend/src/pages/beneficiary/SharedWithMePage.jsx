import LegacySharedWithMePage from './LegacySharedWithMePage.jsx';
import CaseLinkWorkspace from './CaseLinkWorkspace.jsx';

// Activate the replacement workflow only with an explicit adapter. Never fall
// back to invitation acceptance after a new-workflow request fails.
/**
 * Cổng chọn màn hình "Được chia sẻ với tôi" của người thụ hưởng: nếu props.caseLinkActions được cung cấp thì dùng quy trình mới CaseLinkWorkspace (liên kết hồ sơ),
 * ngược lại dùng LegacySharedWithMePage (chấp nhận lời mời cũ). Không bao giờ quay lại luồng cũ khi yêu cầu luồng mới thất bại.
 *
 * @param {object} props Truyền nguyên cho component được chọn.
 * @returns {JSX.Element}
 */
export default function SharedWithMePage(props) {
  return props.caseLinkActions !== undefined ? <CaseLinkWorkspace {...props} /> : <LegacySharedWithMePage {...props} />;
}
