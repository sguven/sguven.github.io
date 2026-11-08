# WorkoutLog Pro · Live demo

**Try it:** https://sguven.github.io/workoutlog-demo/

A gym log built for entry between sets. This is the public demo of the app I use on my phone,
with the same interface and logic. It opens with four weeks of **sample** workout history,
generated relative to today, so the progress screens always look current.

## What to try

- **Workout**: start the next session. Each exercise shows last time's sets and suggests a
  heavier weight when every set hit the top of the rep range. Tick a set to start the rest timer.
- **Progress**: weekly sets per muscle on the muscle map, personal records, a chart per exercise
  and the full history.
- **Library**: 40+ exercises with form cues and the muscles they work. Swap any exercise in the program.

Anything you log is saved only in your browser (localStorage). Tap **Reset** twice in the banner
to restore the sample history.

In the full app, Claude writes the training program from a goal, schedule and equipment, and a
scheduled task sends a coaching email every Sunday. The demo uses the built-in sample program.

Single HTML file, plain JavaScript, no framework and no build step.
