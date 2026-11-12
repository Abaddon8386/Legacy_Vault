import { LockKeyhole } from 'lucide-react';
import './WorkflowGuide.css';

// Explains why an action is blocked. The progress guide that used to live here was removed from every screen.
/**
 * Gợi ý ngắn giải thích vì sao một thao tác đang bị khóa (kèm icon khóa). Không render gì nếu {@code reason} rỗng.
 *
 * @param {{id?:string, reason?:string}} props {@code id} dùng cho aria-describedby của nút.
 */
export function WorkflowActionHint({ id, reason }) {
  return reason ? <p id={id} className="lv-workflow-action-hint"><LockKeyhole size={15} aria-hidden="true" />{reason}</p> : null;
}
