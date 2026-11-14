# Reply to App Review — 2.5.4 and 5.1.1(ii)

Everything between the two rules is the reply. Send it with the new build
attached to the version; both fixes are native configuration, so neither takes
effect until that build is the one under review.

Check the build number in App Store Connect before sending — it should be
1.0 (5), but confirm rather than take my word for it.

---

Thank you for both findings. Each came from a default in a third-party build
plugin rather than from a feature of the app, and both are corrected in the
build submitted with this reply.

**Guideline 2.5.4 — background audio**

The app has no feature that requires persistent audio, and we are not asking
for the capability.

All the app plays is two short chimes: one when a study break begins and one
when a session finishes, each a fraction of a second, each accompanied by a
haptic. Both play only while the app is in the foreground. The study timer
itself is an ordinary in-process interval with no background execution, no
background task and no scheduled audio, so it is suspended by the system when
the app is backgrounded in any case.

The "audio" entry in UIBackgroundModes was added automatically by the audio
library's build plugin, which enables background playback unless told
otherwise. We have now disabled it, and UIBackgroundModes is absent from the
new build's Info.plist entirely. We have also removed the microphone usage
description that the same plugin added, since the app never records audio.

**Guideline 5.1.1(ii) — purpose strings**

You were right that the camera string was inadequate; it was the image-picker
library's default wording rather than anything we had written.

The camera is used in exactly one place: during a study session, "Capture
notes" offers "Take Photo" so a student can photograph their own handwritten
work and keep it with that session. The string now describes that use and
gives an example, as the guidance asks:

"MyStudyFlow uses the camera so you can photograph your own study notes and
keep them with a study session. For example, after working through a page of
maths problems you can take a picture of it and it is saved against that
session, so you can look back at what you actually did."

We have rewritten the other two to the same standard rather than wait to be
asked:

Photo library — "MyStudyFlow uses your photo library so you can attach
pictures you have already taken to a study session. For example, choosing an
existing photo of your worked solutions to keep alongside the time you logged
for that subject."

Location — "MyStudyFlow uses your approximate location to show current weather
on your home screen. For example, showing the temperature and a rain icon for
where you are beside today's classes, so you know what to expect walking
between them. The app works normally if you decline."

The microphone usage description has been removed altogether, as described
above, so the app no longer declares a permission it does not use.

The demo account credentials in App Review Information are unchanged and
confirmed working. Please let us know if anything further would help.

---

## After sending

Nothing else in the submission changed, so there is no new screen recording to
provide. If App Review asks for one demonstrating background audio, the answer
is that there is none to demonstrate — the capability has been removed rather
than justified.
