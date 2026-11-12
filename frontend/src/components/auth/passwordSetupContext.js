import { createContext } from 'react';
/**
 * Context chia sẻ trạng thái thiết lập mật khẩu lần đầu: {@code {needed:boolean, accessToken:string}}. Được cung cấp bởi {@code PasswordSetupProvider}
 * và đọc bởi {@code FirstPasswordButton}.
 */
export const PasswordSetupContext = createContext(null);
