import { useId } from 'react';
import './ChoiceButtons.css';

/**
 * Chọn một giá trị từ danh sách ngắn, hiển thị dạng nút nhưng dùng radio gốc để giữ bàn phím và hành vi form.
 *
 * @param {object} props
 * @param {string} props.title Tiêu đề nhóm (có dấu * bắt buộc).
 * @param {Array<[string, string, boolean?]>} props.options Danh sách [giá trị, nhãn, bị khóa?].
 * @param {string} props.value Giá trị đang chọn.
 * @param {(value:string)=>void} props.onChange Gọi khi chọn.
 * @param {boolean} [props.disabled=false] Khóa cả nhóm.
 * @param {boolean} [props.equal=false] Các lựa chọn rộng bằng nhau.
 */
export default function ChoiceButtons({ title, options, value, onChange, disabled = false, equal = false }) {
  const name = useId();
  return <fieldset className={`lv-choice-group${equal ? ' lv-choice-group--equal' : ''}`} disabled={disabled}>
    <legend>{title}<span className="lv-required-mark" aria-hidden="true">*</span></legend>
    <div className="lv-choice-group__options">
      {options.map(([optionValue, optionLabel, optionDisabled = false]) => <label key={optionValue} className={`lv-choice${value === optionValue ? ' is-selected' : ''}${optionDisabled ? ' is-disabled' : ''}`}>
        <input type="radio" name={name} value={optionValue} checked={value === optionValue} required disabled={optionDisabled} onChange={() => onChange(optionValue)} />
        <span>{optionLabel}</span>
      </label>)}
    </div>
  </fieldset>;
}
