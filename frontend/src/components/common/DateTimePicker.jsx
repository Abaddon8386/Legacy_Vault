import DatePicker from './DatePicker.jsx';
import './DateTimePicker.css';
// Keep local wall-clock values; each existing API adapter retains responsibility for UTC conversion.
export default function DateTimePicker({id,value='',onChange,lang='vi',disabled,required,min,max,className='',...aria}){
  const [date='',time='']=value.split('T');
  return <div className={'lv-datetime-picker '+className}>
    <DatePicker id={id} value={date} onChange={next=>onChange({target:{value:next?`${next}T${time}`:''}})} lang={lang} min={min?.split('T')[0]} max={max?.split('T')[0]} disabled={disabled} required={required} {...aria}/>
    <input type="time" value={time} onChange={event=>onChange({target:{value:`${date}T${event.target.value}`}})} aria-label={lang==='en'?'Time':'Giờ phút'} aria-invalid={aria['aria-invalid']} aria-describedby={aria['aria-describedby']} disabled={disabled} required={required} min={date===min?.split('T')[0]?min.split('T')[1]:undefined} max={date===max?.split('T')[0]?max.split('T')[1]:undefined}/>
  </div>;
}
