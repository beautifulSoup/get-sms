# iOS setup: forward SMS with Shortcuts

GetSms has no app to install on your phone. iOS does not give third-party apps
any way to read SMS, so the device side runs entirely on Apple's own
**Shortcuts** app, using a personal automation that fires whenever a matching
text message arrives and forwards it to your GetSms server.

This is a one-time setup per phone. It takes about five minutes.

## Before you start

You need:
- Your GetSms server's public URL (e.g. `https://sms.example.com`).
- The ingest token for **this specific phone**, from your `GETSMS_DEVICES`
  config (the `token` field for this device's entry).

Your full ingest URL will be:

```
https://YOUR_SERVER/ingest/YOUR_DEVICE_TOKEN
```

## Steps

1. Open the **Shortcuts** app → tap the **Automation** tab → tap **+** (top
   right) → **Create Personal Automation** → scroll down and choose
   **Message**.

2. Configure the trigger:
   - Leave **Sender** **blank**. Do not try to fill it in — verification
     codes come from 5–6 digit short codes, and iOS's Sender picker cannot
     target those.
   - Turn on **Message Contains** and set it to `验证码` (or add your own
     term/terms if your codes arrive in another language, e.g. `code` or
     `verification`).
   - Tap **Next**.

   Note: with this filter, the automation will trigger for **every** message
   that contains this text, from any sender. That is expected — GetSms does
   the real keyword/source filtering later, when your agent asks for a code.

3. Add the action **Get Contents of URL**:
   - **URL**: `https://YOUR_SERVER/ingest/YOUR_DEVICE_TOKEN`
   - **Method**: `POST`
   - **Request Body**: `JSON`, with one field:
     - Key: `text`
     - Value: the **Shortcut Input** variable (tap the field, pick the
       magic-variable icon, choose "Shortcut Input" — this is the incoming
       message's body text).
   - Tap **Next**.

4. On the final confirmation screen:
   - Turn **Run Immediately** **ON**.
   - Turn **Notify When Run** **OFF**.

   (Both toggles are available on iOS 17 and later. Run Immediately lets the
   automation fire without asking you to tap "Run" each time; turning off the
   notification keeps it silent.)

5. Save the automation. It's now live — the next matching text message will
   be POSTed to your GetSms server automatically.

## Reliability caveat — read this

> **Automations can silently stop working.** iOS sometimes disables personal
> automations after a system update, without any warning. If verification
> codes stop showing up through GetSms, open Shortcuts → Automation, check
> that this automation is still listed and enabled, and re-enable or recreate
> it if needed.
>
> Behavior on a **locked device** and in the window **after a reboot, before
> the phone has been unlocked once**, is not guaranteed — Apple does not
> document this for personal automations, and it can vary by iOS version.
> Test this on your own device and don't rely on it for anything
> time-critical until you've confirmed it works the way you expect.

## Repeat for each phone

If you forward SMS from more than one phone, repeat this whole process on
each device, using that device's own ingest token from `GETSMS_DEVICES`.
