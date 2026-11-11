import { useId } from 'react';
import './ChoiceButtons.css';

/** One choice from a short list, shown as buttons. Native radios keep keyboard and form behaviour. */
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
