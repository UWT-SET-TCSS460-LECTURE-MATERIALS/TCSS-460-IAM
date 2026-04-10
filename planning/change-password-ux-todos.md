---
name: Change Password UX Improvements
description: Side TODO — UX fixes for the hosted change password page (navigation context, password visibility toggle, cancel/close behavior for popup windows)
type: project
---

## Change Password Page UX Issues

### 1. Navigation context problem
The change password page currently always shows "Back to Profile" link. But when a user arrives from a tenant app (popup window), there's no profile context — they just want to change their password and leave. 

**Options:**
- Remove "Back to Profile" entirely and have two versions of the page
- One version accessible from profile flow (keeps the back link)
- One standalone version for direct/popup access (no back link, has cancel/close instead)
- Or: detect context (query param? referrer?) and conditionally show the right navigation

**Why:** Tenant apps open this in a popup. "Back to Profile" is confusing when there's no profile session to go back to.

### 2. Password visibility toggle
Add eyeball icon (or similar UI widget) to toggle password field visibility on the change password form. Applies to current password, new password, and confirm password fields.

**Why:** Standard UX pattern. Users expect it.

### 3. Cancel / close behavior for popup context
Add a cancel option to the change password page. When the page is opened in a popup window (tenant app flow), clicking cancel should close the popup window (`window.close()`). When opened as a regular page, cancel could navigate back or just do nothing.

**How to apply:** Detect popup context (e.g., `window.opener` exists in JS) and wire cancel to `window.close()`. Same pattern could apply to other account pages opened from tenant apps.
