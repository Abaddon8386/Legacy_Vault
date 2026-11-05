import './DurationFields.css';

/** Days, hours and minutes as three labelled number boxes, shared by the check cycle and the grace period. */
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
