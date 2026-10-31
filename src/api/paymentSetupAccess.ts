import { apiRequest, getToken } from "./client";
import { createSessionRead } from "./sessionRead";

// A UI capability, never a replacement for owner authorization on GET/PUT.
const access = createSessionRead(getToken, async () => {
    const result = await apiRequest<{can_configure: boolean}>("/admin/payment-setup/access");
    return result.can_configure === true;
});
window.addEventListener("barticket-auth", access.invalidate);
window.addEventListener("focus", access.revalidate);
window.addEventListener("barticket-users-updated", access.invalidate);
export const paymentSetupAccess = access;
