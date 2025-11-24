# Clerk Redirect URL Configuration

## Issue
After logging in with Clerk, users are being redirected to `localhost:3000` instead of your Railway domain. This happens because Clerk's redirect URLs are configured in the Clerk dashboard, not in your code.

## Solution

You need to update the redirect URLs in your Clerk dashboard to point to your Railway domain.

### Steps:

1. **Go to Clerk Dashboard**
   - Visit [dashboard.clerk.com](https://dashboard.clerk.com)
   - Select your application

2. **Navigate to Paths Settings**
   - Go to **Paths** in the left sidebar
   - Or go to **Settings** → **Paths**

3. **Update Redirect URLs**
   - Find the **After sign-in redirect** field
   - Update it to: `https://your-app-name.up.railway.app/dashboard`
   - Find the **After sign-up redirect** field
   - Update it to: `https://your-app-name.up.railway.app/dashboard`

4. **Add Allowed Redirect URLs** (if needed)
   - Go to **Settings** → **Paths** → **Redirect URLs**
   - Add your Railway domain:
     - `https://your-app-name.up.railway.app/*`
     - `https://your-app-name.up.railway.app/dashboard`
     - `https://your-app-name.up.railway.app/sign-in`
     - `https://your-app-name.up.railway.app/sign-up`

5. **For Development (Optional)**
   - You can also add `http://localhost:3000/*` for local development
   - This allows you to test locally while keeping production URLs

### Important Notes:

- Replace `your-app-name.up.railway.app` with your actual Railway domain
- The code has been updated to use `afterSignInUrl="/dashboard"` and `afterSignUpUrl="/dashboard"` in the SignIn/SignUp components
- These code settings work in conjunction with Clerk dashboard settings
- If you have a custom domain, use that instead of the Railway domain

### Verification:

After updating:
1. Sign out from your app
2. Sign in again
3. You should be redirected to `/dashboard` on your Railway domain, not localhost

