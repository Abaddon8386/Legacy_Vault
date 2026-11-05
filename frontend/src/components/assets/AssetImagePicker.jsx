import { useEffect, useRef, useState } from 'react';
import { validateAssetImages } from '../../services/assetImageService.js';
import './AssetImages.css';
import './AssetFilePicker.css';

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
    <div className="lv-asset-image-grid">{files.map((file, i) => <SelectedImage key={i} file={file} label={en ? 'Remove' : 'Bỏ ảnh'} disabled={disabled} onRemove={() => onChange(files.filter((_, index) => index !== i))} />)}</div>
  </fieldset>;
}
function SelectedImage({ file, label, disabled, onRemove }) {
  const image = useRef(null);
  useEffect(() => { const src=URL.createObjectURL(file); if (image.current) image.current.src=src; return () => URL.revokeObjectURL(src); }, [file]);
  return <figure><img ref={image} alt={file.name} /><figcaption>{file.name} · {(file.size / 1048576).toFixed(2)} MiB</figcaption><button type="button" disabled={disabled} onClick={onRemove}>{label}</button></figure>;
}
