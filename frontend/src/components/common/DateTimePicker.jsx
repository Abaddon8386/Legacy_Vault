import DatePicker from './DatePicker.jsx';
import './DateTimePicker.css';
// Keep local wall-clock values; each existing API adapter retains responsibility for UTC conversion.
/**
 * Ô chọn ngày giờ gồm {@code DatePicker} và ô giờ gốc. Giá trị là chuỗi giờ địa phương {@code YYYY-MM-DDTHH:mm}; việc đổi sang UTC do adapter API của từng màn hình đảm nhiệm.
 * {@code onChange} nhận đối tượng giả {@code {target:{value}}} để dùng như input thường.
 *
 * @param {object} props
 * @param {string} [props.id]
 * @param {string} [props.value=''] Giá trị {@code date[Ttime]}.
 * @param {Function} props.onChange
 * @param {string} [props.lang='vi']
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.required]
 * @param {string} [props.min] Giá trị nhỏ nhất (chỉ phần ngày được dùng).
 * @param {string} [props.max] Giá trị lớn nhất (chỉ phần ngày được dùng).
 */
export default function DateTimePicker({id,value='',onChange,lang='vi',disabled,required,min,max,className='',...aria}){
  const [date='',time='']=value.split('T');
  return <div className={'lv-datetime-picker '+className}>
    <DatePicker id={id} value={date} onChange={next=>onChange({target:{value:next?`${next}T${time}`:''}})} lang={lang} min={min?.split('T')[0]} max={max?.split('T')[0]} disabled={disabled} required={required} {...aria}/>
    <input type="time" value={time} onChange={event=>onChange({target:{value:`${date}T${event.target.value}`}})} aria-label={lang==='en'?'Time':'Giờ phút'} aria-invalid={aria['aria-invalid']} aria-describedby={aria['aria-describedby']} disabled={disabled} required={required} min={date===min?.split('T')[0]?min.split('T')[1]:undefined} max={date===max?.split('T')[0]?max.split('T')[1]:undefined}/>
  </div>;
}
