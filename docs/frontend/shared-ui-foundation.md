# FE-00: thành phần giao diện dùng chung

Phạm vi: các component trong `frontend/src/components/common`, token và khung làm việc dùng chung. Giữ sidebar xanh, logo, menu, quyền và luồng API hiện có. Trang giới thiệu/đăng nhập giữ kiểu chữ riêng; chỉ tiêu đề trong khu vực ứng dụng chuyển sang sans-serif.

## Quy ước dùng chung

| Thành phần | Dùng khi | Quy ước |
| --- | --- | --- |
| `Button` primary | Hành động chính | Xanh đậm, chữ trắng; ưu tiên một hành động chính cho mỗi khu vực quyết định |
| `Button` secondary | Xem, quay lại, thao tác phụ | Nền trắng, viền rõ |
| `Button` danger | Hủy hoặc thao tác có hậu quả | Chữ/viền đỏ, tên nút nói rõ hành động; không thay thế bước xác nhận nghiệp vụ |
| `Button` ghost | Điều hướng phụ | Gạch chân để phân biệt với nội dung tĩnh |
| `FeedbackNotice` info | Thông tin cần biết | Biểu tượng và khung xanh lam; không dùng thay lỗi |
| `FeedbackNotice` warning | Cần chú ý/bổ sung | Biểu tượng cảnh báo, chữ nâu đậm trên nền vàng nhạt |
| `FeedbackNotice` error | Thao tác/tải thất bại | Biểu tượng và viền đỏ, `role="alert"` |
| `FeedbackNotice` success | Đã có xác nhận thành công | Khung xanh lá, `role="status"`; chỉ hiển thị khi có xác nhận thật |
| `LoadingState` | Đang chờ dữ liệu | Truyền `message` đúng tác vụ; `compact` dùng trong một vùng nhỏ |
| `EmptyState` | Đã tải thành công nhưng chưa có dữ liệu | Giữ API props hiện có; trang gọi quyết định đây có thực sự là trạng thái rỗng |
| `ErrorState` | Không tải được dữ liệu | Giữ API props hiện có; chỉ có nút nếu được truyền callback thực hiện được |

`Button` giữ vùng bấm ít nhất 44 × 44px kể cả `size="sm"`; nội dung dài được xuống dòng. `isLoading` khóa nút, giữ tên hành động và thêm `aria-busy`. Tránh ghi đè chiều cao/chiều rộng khiến nút nhỏ hơn yêu cầu.

Token: `--lv-action-primary`, `--lv-action-primary-hover`, `--lv-action-focus`, `--lv-control-border`, `--lv-control-min-size`; khoảng cách `--lv-space-1/2/3/4/6/8` tương ứng 4/8/12/16/24/32px. Vàng dùng làm điểm nhấn thương hiệu; không dùng nền vàng nhạt với chữ trắng cho CTA mới.

## Ví dụ tích hợp

```jsx
import { Button } from '../../components/common/Button.jsx';
import FeedbackNotice from '../../components/common/FeedbackNotice.jsx';
import LoadingState from '../../components/common/LoadingState.jsx';

<Button isLoading={saving} disabled={!canSave} onClick={save}>
  {en ? 'Save changes' : 'Lưu thay đổi'}
</Button>

<FeedbackNotice
  tone="error"
  title={en ? 'Unable to load documents' : 'Chưa tải được giấy tờ'}
  action={<Button variant="secondary" onClick={retry}>
    {en ? 'Try again' : 'Thử lại'}
  </Button>}
>
  {errorMessage}
</FeedbackNotice>

<LoadingState compact message={en ? 'Loading documents…' : 'Đang tải giấy tờ…'} />
```

Trang gọi cung cấp nội dung VI/EN và callback. Component không đọc session, không gọi API, không tự suy luận quyền, điều kiện hồ sơ hoặc thành công.

## Bàn giao cho các task sau

- Huy giữ đầu mối thay đổi component chung; Thái dùng các component này khi sửa trang Owner/Staff.
- FE-L01/L02, FE-A01, FE-O01/O02, FE-S01/S02 xử lý thông tin nghiệp vụ, bố cục và các nút viết riêng trong từng trang. FE-00 không thay toàn bộ các nút/form riêng của những trang đó.
- Không coi HTTP 404 bất kỳ là danh sách rỗng; ánh xạ theo contract của đúng endpoint.
- Giữ nội dung đã nhập khi lỗi; không đổi dữ liệu cũ thành dữ liệu mới hoặc hiện thành công trước phản hồi server.
- Thử lại dành cho lỗi có khả năng khôi phục. Không thêm nút tải lại lặp lại ở mọi khu vực.
- Mỗi người cập nhật `develop` sau khi FE-00 được merge trước khi làm task kế tiếp.
