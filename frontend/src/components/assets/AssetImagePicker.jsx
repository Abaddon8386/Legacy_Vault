import { useState } from 'react';
import { validateAssetImages } from '../../services/assetImageService.js';
import './AssetImages.css';
import './AssetFilePicker.css';
import './AssetAttachmentTable.css';

/**
 * Ô chọn ảnh JPEG/PNG đính kèm tài sản (tối đa 5 ảnh, mỗi ảnh 5 MB, tính cả {@code existingCount} ảnh đã có). Gộp ảnh mới vào danh sách hiện tại, kiểm tra bằng
 * {@code validateAssetImages}; sai thì hiện lỗi và không cập nhật. Không gọi API; việc tải lên do component cha thực hiện.
 *
 * @param {object} props
 * @param {File[]} props.files Ảnh đang chọn.
 * @param {(files:File[])=>void} props.onChange Cập nhật danh sách.
 * @param {boolean} props.disabled Khóa ô chọn.
 * @param {string} [props.lang='vi']
 * @param {number} [props.existingCount=0] Số ảnh đã có của tài sản.
 */
export function AssetImagePicker({ files, onChange, disabled, lang = 'vi', existingCount = 0 }) {
  const en = lang === 'en';
  const [error, setError] = useState('');
  return <fieldset className="lv-asset-images" disabled={disabled}>
    <legend>{en ? 'Photos (optional)' : 'Ảnh (tùy chọn)'}</legend>
    <p>{en ? 'Maximum 5 JPEG/PNG images, 5 MB each. Images count toward vault storage.' : 'Tối đa 5 ảnh JPEG/PNG, mỗi ảnh 5 MB. Ảnh tính vào dung lượng kho.'}</p>
    <label className="lv-asset-file-picker"><strong>{en ? 'Add photos' : 'Thêm ảnh'}</strong>
    <input type="file" accept="image/jpeg,image/png" multiple disabled={disabled} aria-label={en ? 'Add photos' : 'Thêm ảnh'} onChange={e => {
      const next = [...files, ...Array.from(e.target.files || [])]; e.target.value = '';
      const code = validateAssetImages(next, existingCount);
      setError(code ? (en ? 'Choose at most 5 JPEG/PNG photos, each between 1 byte and 5 MB.' : 'Chọn tối đa 5 ảnh JPEG/PNG, mỗi ảnh không rỗng và không quá 5 MB.') : '');
      if (!code) onChange(next);
    }} /></label>
    {error && <p role="alert">{error}</p>}
    {files.length > 0 && <table className="lv-asset-table">
      <thead><tr><th scope="col">{en ? 'File name' : 'Tên tệp'}</th><th scope="col">{en ? 'Action' : 'Thao tác'}</th></tr></thead>
      <tbody>{files.map((file, i) => <tr key={i}>
        <td>{file.name}</td>
        <td><button type="button" disabled={disabled} onClick={() => onChange(files.filter((_, index) => index !== i))}>{en ? 'Remove' : 'Bỏ ảnh'}</button></td>
      </tr>)}</tbody>
    </table>}
  </fieldset>;
}
