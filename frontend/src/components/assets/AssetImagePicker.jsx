import { useEffect, useRef, useState } from 'react';
import { validateAssetImages } from '../../services/assetImageService.js';
import './AssetImages.css';
import './AssetFilePicker.css';

export function AssetImagePicker({ files, onChange, disabled, lang = 'vi', existingCount = 0 }) {
  const en = lang === 'en';
  const [error, setError] = useState('');
  return <fieldset className="lv-asset-images" disabled={disabled}>
    <legend>{en ? 'Asset photos (optional)' : 'Ảnh tài sản (tùy chọn)'}</legend>
    <p>{en ? 'Up to 5 JPEG/PNG photos per asset, 5 MB each. Photos count toward vault storage.' : 'Tối đa 5 ảnh JPEG/PNG mỗi tài sản, 5 MB/ảnh. Ảnh được tính vào dung lượng kho.'}</p>
    <label className="lv-asset-file-picker"><strong>{en ? 'Choose asset photos' : 'Chọn ảnh tài sản'}</strong><span>{files.length ? (en ? `${files.length} photos selected` : `Đã chọn ${files.length} ảnh`) : (en ? 'No photos selected' : 'Chưa chọn ảnh')}</span>
    <input type="file" accept="image/jpeg,image/png" multiple disabled={disabled} aria-label={en ? 'Choose asset photos' : 'Chọn ảnh tài sản'} onChange={e => {
      const next = [...files, ...Array.from(e.target.files || [])]; e.target.value = '';
      const code = validateAssetImages(next, existingCount);
      setError(code ? (en ? 'Choose at most 5 JPEG/PNG photos, each between 1 byte and 5 MB.' : 'Chọn tối đa 5 ảnh JPEG/PNG, mỗi ảnh không rỗng và không quá 5 MB.') : '');
      if (!code) onChange(next);
    }} /></label>
    {error && <p role="alert">{error}</p>}
    <div className="lv-asset-image-grid">{files.map((file, i) => <SelectedImage key={i} file={file} label={en ? 'Remove' : 'Bỏ ảnh'} disabled={disabled} onRemove={() => onChange(files.filter((_, index) => index !== i))} />)}</div>
  </fieldset>;
}
function SelectedImage({ file, label, disabled, onRemove }) {
  const image = useRef(null);
  useEffect(() => { const src=URL.createObjectURL(file); if (image.current) image.current.src=src; return () => URL.revokeObjectURL(src); }, [file]);
  return <figure><img ref={image} alt={file.name} /><figcaption>{file.name} · {(file.size / 1048576).toFixed(2)} MiB</figcaption><button type="button" disabled={disabled} onClick={onRemove}>{label}</button></figure>;
}
