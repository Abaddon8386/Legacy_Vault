import './DurationFields.css';

/**
 * Ba ô số có nhãn (ngày, giờ, phút) dùng chung cho chu kỳ kiểm tra và thời gian ân hạn. Thuần hiển thị.
 *
 * @param {object} props
 * @param {string} props.legend Tiêu đề nhóm.
 * @param {Array<{id:string,label:string,invalid?:boolean}>} props.fields Danh sách ô (các thuộc tính còn lại được truyền thẳng vào input).
 * @param {boolean} props.disabled Khóa các ô.
 * @param {string} props.describedBy Id phần mô tả/lỗi cho aria-describedby.
 */
export default function DurationFields({ legend, fields, disabled, describedBy }) {
  return <fieldset className="lv-duration-fields">
    <legend>{legend}</legend>
    <div className="lv-duration-fields__row">
      {fields.map(({ label, invalid, ...input }) => <div key={input.id} className="lv-duration-fields__field">
        <label htmlFor={input.id}>{label}</label>
        <input {...input} type="number" step="1" min="0" disabled={disabled} aria-invalid={Boolean(invalid)} aria-describedby={describedBy} />
      </div>)}
    </div>
  </fieldset>;
}
