# BEAST PROJECT GARAGE — TEST REPORT

Generated 2026-11-20T10:40:26.147Z by `npm run garage:report`. Every scenario runs the real stack: the project's firmware in the sandboxed interpreter → its circuit graph → driver/motor models → planar physics → sensor geometry → back to the firmware. No path following or scripted results are used.

## Readiness (14 automated checks per project)

| Project | Status | Failed checks | Warnings |
| --- | --- | --- | --- |
| LF-01 Basic Line Follower | **READY TO SIMULATE** | — | — |
| LF-02 Advanced Five-Sensor Line Follower | **READY TO SIMULATE** | — | — |
| LF-03 PID Line Follower | **READY TO SIMULATE** | — | — |
| RR-04 Standard 4WD Robo Race Car | **READY TO SIMULATE** | — | — |
| RR-05 4WD Off-Road Rover | **READY TO SIMULATE** | — | — |
| RR-06 4WD Experimental Robot | **READY TO SIMULATE** | — | — |
| RR-02 Four-Wheel Drive Racer | **READY TO SIMULATE** | — | — |
| RR-01 Basic 2WD Robo Racer | **READY TO SIMULATE** | — | — |
| RR-03 Encoder-Based Smart Racer | **READY TO SIMULATE** | — | — |
| RW-04 4WD Sumo Robot | **READY TO SIMULATE** | — | — |
| RW-01 Basic Sumo Robot | **READY TO SIMULATE** | — | — |
| RW-02 Advanced Sumo Robot | **READY TO SIMULATE** | — | — |
| RW-03 Intelligent Sumo Robot | **READY TO SIMULATE** | — | — |

## Summary

- Required scenarios: **67 / 67 passed**
- Observed-behaviour scenarios (recorded, not required): 19, of which 18 succeeded

## Line following

| Test | Project | Configuration | Expected | Actual | Result |
| --- | --- | --- | --- | --- | --- |
| Straight line | LF-01 | 2.4 m straight black line, 19 mm tape | Travels along the line, staying within 3 cm of it | Reached x = 0.98 m; max deviation after calibration 0.1 cm | ✅ PASS |
| Curved line | LF-01 | Student loop: 1.2 m straights joined by 0.35 m-radius curves | Completes a lap | Lap completed in 18.0 s; on the line 100% of samples; 0 off-track event(s) | ✅ PASS |
| Sharp turns | LF-01 | Line · Sharp Corners (90° corners) | Completes a lap; may briefly leave the line at corners | Lap completed in 18.0 s; on the line 97% of samples; 2 off-track event(s) | ✅ PASS |
| Line width 12 mm | LF-01 | Rounded loop with 12 mm line | Completes a lap | Lap completed in 24.0 s; on the line 100% of samples; 0 off-track event(s) | ✅ PASS |
| Line width 30 mm | LF-01 | Rounded loop with 30 mm line | Completes a lap | Lap completed in 32.0 s; on the line 100% of samples; 0 off-track event(s) | ✅ PASS |
| Intersections | LF-01 | Line · Figure-8 Crossing (one + intersection and a side loop) | Crosses the intersection and completes a lap | Lap completed in 26.0 s; on the line 100% of samples; 0 off-track event(s) | ✅ PASS |
| Custom student course | LF-01 | Student course: straight, 18 cm-radius curve, sharp 90° corner, wide curve | Attempts the course using only its sensors (tight 18 cm curves are hard) | Lap completed in 15.5 s; on the line 92% of samples; 0 off-track event(s) | ✅ PASS |
| Lost-line recovery | LF-01 | Starts 25 mm beside the line, angled 20° across it | Re-acquires the line and ends up following it (|y| < 1.5 cm) | First centred at 3.1 s; final offset -0.7 cm | ✅ PASS |
| Straight line | LF-02 | 2.4 m straight black line, 19 mm tape | Travels along the line, staying within 3 cm of it | Reached x = 0.95 m; max deviation after calibration 0.3 cm | ✅ PASS |
| Curved line | LF-02 | Student loop: 1.2 m straights joined by 0.35 m-radius curves | Completes a lap | Lap completed in 16.0 s; on the line 100% of samples; 0 off-track event(s) | ✅ PASS |
| Sharp turns | LF-02 | Line · Sharp Corners (90° corners) | Completes a lap; may briefly leave the line at corners | Lap completed in 15.5 s; on the line 100% of samples; 0 off-track event(s) | ✅ PASS |
| Line width 12 mm | LF-02 | Rounded loop with 12 mm line | Completes a lap | Lap completed in 19.0 s; on the line 100% of samples; 0 off-track event(s) | ✅ PASS |
| Line width 30 mm | LF-02 | Rounded loop with 30 mm line | Completes a lap | Lap completed in 17.0 s; on the line 100% of samples; 0 off-track event(s) | ✅ PASS |
| Intersections | LF-02 | Line · Figure-8 Crossing (one + intersection and a side loop) | Crosses the intersection and completes a lap | Lap completed in 21.0 s; on the line 100% of samples; 0 off-track event(s) | ✅ PASS |
| Custom student course | LF-02 | Student course: straight, 18 cm-radius curve, sharp 90° corner, wide curve | Attempts the course using only its sensors (tight 18 cm curves are hard) | Lap completed in 14.0 s; on the line 100% of samples; 0 off-track event(s) | ✅ PASS |
| Lost-line recovery | LF-02 | Starts 25 mm beside the line, angled 20° across it | Re-acquires the line and ends up following it (|y| < 1.5 cm) | First centred at 3.1 s; final offset 0.5 cm | ✅ PASS |
| Straight line | LF-03 | 2.4 m straight black line, 19 mm tape | Travels along the line, staying within 3 cm of it | Reached x = 0.94 m; max deviation after calibration 0.2 cm | ✅ PASS |
| Curved line | LF-03 | Student loop: 1.2 m straights joined by 0.35 m-radius curves | Completes a lap | Lap completed in 15.5 s; on the line 100% of samples; 0 off-track event(s) | ✅ PASS |
| Sharp turns | LF-03 | Line · Sharp Corners (90° corners) | Completes a lap; may briefly leave the line at corners | Lap completed in 15.0 s; on the line 100% of samples; 0 off-track event(s) | ✅ PASS |
| Line width 12 mm | LF-03 | Rounded loop with 12 mm line | Completes a lap | Lap completed in 16.0 s; on the line 100% of samples; 0 off-track event(s) | ✅ PASS |
| Line width 30 mm | LF-03 | Rounded loop with 30 mm line | Completes a lap | Lap completed in 16.0 s; on the line 100% of samples; 0 off-track event(s) | ✅ PASS |
| Intersections | LF-03 | Line · Figure-8 Crossing (one + intersection and a side loop) | Crosses the intersection and completes a lap | Lap completed in 15.5 s; on the line 100% of samples; 0 off-track event(s) | ✅ PASS |
| Custom student course | LF-03 | Student course: straight, 18 cm-radius curve, sharp 90° corner, wide curve | Attempts the course using only its sensors (tight 18 cm curves are hard) | Lap completed in 13.5 s; on the line 100% of samples; 0 off-track event(s) | ✅ PASS |
| Lost-line recovery | LF-03 | Starts 25 mm beside the line, angled 20° across it | Re-acquires the line and ends up following it (|y| < 1.5 cm) | First centred at 3.1 s; final offset -0.4 cm | ✅ PASS |
| Sensor calibration | LF-02 | Firmware sweeps over the line during its first seconds | Every sensor records a white minimum and a black maximum at least 400 counts apart | Ranges: 51-972 51-972 51-972 51-972 51-972 | ✅ PASS |
| Sensor calibration | LF-03 | Firmware sweeps over the line during its first seconds | Every sensor records a white minimum and a black maximum at least 400 counts apart | Ranges: 51-972 51-972 51-972 51-972 51-972 51-972 51-972 51-972 | ✅ PASS |
| PID telemetry and live tuning | LF-03 | Runs 5 s, then sends P0.20 over Serial | Telemetry lines PID,error,prev,integral,derivative,output,left,right,ticksL,ticksR stream every 100 ms; firmware keeps running after retuning | 50 telemetry lines; last: PID,-267.00,-267.00,-20000.00,-29.00,-83.50,77,244,3071,3745 | ✅ PASS |

## Robo Race

| Test | Project | Configuration | Expected | Actual | Result |
| --- | --- | --- | --- | --- | --- |
| Forward · reverse · left · right · stop (via Bluetooth) | RR-01 | Commands F, S, B, S, L, R, S sent over the HC-05 serial link | Accelerates forward gradually, brakes to a stop, reverses, spins left then right | forward 0.54 m/s (0.10 m/s after 0.2 s, heading drift -2.1°); after S 0.000 m/s; reverse -0.38 m/s; left 104°, right -79° | ✅ PASS |
| Acceleration and braking | RR-01 | Boost on + forward for 1 s, then stop | Speed rises over several samples (acceleration ramp); stops in under 0.6 s (braking ramp) | speed samples 0.03 → 0.10 → 0.18 → 0.27 → 0.36 → 0.45 → 0.55 → 0.64 → 0.72 → 0.75; stopped after 0.45 s | ✅ PASS |
| Collision | RR-01 | Straight road with a 20 cm obstacle 1.8 m ahead; driver holds W | Robot hits the obstacle and stops against it | Collision at 3.35 s; final speed 0.00 m/s | ✅ PASS |
| Custom track (keyboard driver) | RR-01 | Student-built rounded-rectangle road; keys chosen by a scripted driver (Q/E/F) | The robot responds to the keys on the new track and completes a lap | Lap in 19.7 s; 0 off-track event(s) | ✅ PASS |
| Forward · reverse · left · right · stop (via Bluetooth) | RR-02 | Commands F, S, B, S, L, R, S sent over the HC-05 serial link | Accelerates forward gradually, brakes to a stop, reverses, spins left then right | forward 0.66 m/s (0.14 m/s after 0.2 s, heading drift 0.3°); after S 0.000 m/s; reverse -0.46 m/s; left 44°, right -36° | ✅ PASS |
| Acceleration and braking | RR-02 | Boost on + forward for 1 s, then stop | Speed rises over several samples (acceleration ramp); stops in under 0.6 s (braking ramp) | speed samples 0.04 → 0.14 → 0.25 → 0.36 → 0.47 → 0.58 → 0.69 → 0.80 → 0.89 → 0.93; stopped after 0.40 s | ✅ PASS |
| Collision | RR-02 | Straight road with a 20 cm obstacle 1.8 m ahead; driver holds W | Robot hits the obstacle and stops against it | Collision at 2.77 s; final speed -0.00 m/s | ✅ PASS |
| Custom track (keyboard driver) | RR-02 | Student-built rounded-rectangle road; keys chosen by a scripted driver (Q/E/F) | The robot responds to the keys on the new track and completes a lap | Lap in 16.0 s; 0 off-track event(s) | ✅ PASS |
| Encoder speed control | RR-03 | Straight road, setpoint 18 ticks / 50 ms | Firmware RPM from encoder ticks matches the simulated wheel RPM within 15%, and its speed estimate matches the real speed | firmware 120 rpm vs simulated 122 rpm; firmware 43.9 cm/s vs real 45.0 cm/s | ✅ PASS |
| Autonomous lap | RR-03 | Race · Beginner Oval | Keeps itself on the road with its two road sensors and completes a lap | Lap completed in 21.5 s; on the line 22% of samples; 3 off-track event(s) | ✅ PASS |
| Custom track (autonomous) | RR-03 | Custom race loop | Keeps itself on the road with its two road sensors and completes a lap | Lap completed in 19.0 s; on the line 38% of samples; 0 off-track event(s) | ✅ PASS |
| Obstacle course | RR-03 | Race · S-Curves & Obstacles | Observed behaviour only — RR-03 has no obstacle sensor | No lap within 60 s (6 off-track event(s), worst distance 33.4 cm) | ℹ️ OBSERVED |
| 4WD: all four motors forward / reverse | RR-04 | Flat test area; F for 1.5 s, stop, B for 1.2 s (Bluetooth commands) | F turns all four wheels forward and the robot drives straight ahead; B turns all four backwards and it reverses | F: 0.80 m/s, heading drift 0°, wheel rpm FL/FR/RL/RR 234/234/234/234; B: -0.56 m/s, rpm -164/-164/-164/-164 | ✅ PASS |
| 4WD: left / right turns | RR-04 | Flat test area; Q (forward-left) for 1 s, stop, E (forward-right) for 1 s | Q curves left (heading increases) while moving forward; E curves right (heading decreases) | Q: 36° while moving 37 cm forward; E: -36° while moving 37 cm forward | ✅ PASS |
| 4WD: pivot turn in place | RR-04 | Flat test area; L for 0.8 s, stop, R for 0.8 s | Left pair backwards + right pair forwards spins the robot left on the spot (and the reverse for R) | L: 110°, centre moved 2.5 cm, rpm FL/FR/RL/RR -200/201/-192/193; R: -110°, moved 2.4 cm | ✅ PASS |
| 4WD: individual motor test | RR-04 | Commands 1, 2, 3, 4 (FL, FR, RL, RR) one after another, 0 between them | Only the selected motor receives voltage and only its wheel is driven (turning forward); the others are braked | motor voltages FL/FR/RL/RR and wheel rpm — FL: 7.5/0.0/0.0/0.0 V, rpm 149/10/17/10; FR: 0.0/7.5/0.0/0.0 V, rpm 10/150/10/16; RL: 0.0/0.0/7.5/0.0 V, rpm 19/12/144/12; RR: 0.0/0.0/0.0/7.5 V, rpm 11/18/12/144 | ✅ PASS |
| 4WD: four driven wheels, no caster, symmetrical | RR-04 | Built project and its physics model | No caster; four motors, each wheel on its own motor; FL/FR and RL/RR mirror-symmetric; identical wheels; four driven wheels in the physics model | 0 caster(s); wheels FL (75, 92) FR (75, -92) RL (-75, 92) RR (-75, -92) mm; asymmetry 0.0 mm; wheels 65×26 mm; 4 driven wheels in the model | ✅ PASS |
| 4WD: all four motors forward / reverse | RR-05 | Flat test area; F for 1.5 s, stop, B for 1.2 s (Bluetooth commands) | F turns all four wheels forward and the robot drives straight ahead; B turns all four backwards and it reverses | F: 0.99 m/s, heading drift 0°, wheel rpm FL/FR/RL/RR 222/222/222/222; B: -0.69 m/s, rpm -155/-155/-155/-155 | ✅ PASS |
| 4WD: left / right turns | RR-05 | Flat test area; Q (forward-left) for 1 s, stop, E (forward-right) for 1 s | Q curves left (heading increases) while moving forward; E curves right (heading decreases) | Q: 27° while moving 46 cm forward; E: -28° while moving 48 cm forward | ✅ PASS |
| 4WD: pivot turn in place | RR-05 | Flat test area; L for 0.8 s, stop, R for 0.8 s | Left pair backwards + right pair forwards spins the robot left on the spot (and the reverse for R) | L: 107°, centre moved 1.6 cm, rpm FL/FR/RL/RR -197/198/-191/193; R: -111°, moved 1.6 cm | ✅ PASS |
| 4WD: individual motor test | RR-05 | Commands 1, 2, 3, 4 (FL, FR, RL, RR) one after another, 0 between them | Only the selected motor receives voltage and only its wheel is driven (turning forward); the others are braked | motor voltages FL/FR/RL/RR and wheel rpm — FL: 7.5/0.0/0.0/0.0 V, rpm 131/16/21/16; FR: 0.0/7.5/0.0/0.0 V, rpm 17/132/17/22; RL: 0.0/0.0/7.5/0.0 V, rpm 24/19/127/19; RR: 0.0/0.0/0.0/7.5 V, rpm 19/24/19/127 | ✅ PASS |
| 4WD: four driven wheels, no caster, symmetrical | RR-05 | Built project and its physics model | No caster; four motors, each wheel on its own motor; FL/FR and RL/RR mirror-symmetric; identical wheels; four driven wheels in the physics model | 0 caster(s); wheels FL (85, 99) FR (85, -99) RL (-85, 99) RR (-85, -99) mm; asymmetry 0.0 mm; wheels 85×30 mm; 4 driven wheels in the model | ✅ PASS |
| 4WD: all four motors forward / reverse | RR-06 | Flat test area; F for 1.5 s, stop, B for 1.2 s (Bluetooth commands) | F turns all four wheels forward and the robot drives straight ahead; B turns all four backwards and it reverses | F: 0.80 m/s, heading drift 0°, wheel rpm FL/FR/RL/RR 234/234/234/234; B: -0.56 m/s, rpm -164/-164/-164/-164 | ✅ PASS |
| 4WD: left / right turns | RR-06 | Flat test area; Q (forward-left) for 1 s, stop, E (forward-right) for 1 s | Q curves left (heading increases) while moving forward; E curves right (heading decreases) | Q: 36° while moving 37 cm forward; E: -36° while moving 37 cm forward | ✅ PASS |
| 4WD: pivot turn in place | RR-06 | Flat test area; L for 0.8 s, stop, R for 0.8 s | Left pair backwards + right pair forwards spins the robot left on the spot (and the reverse for R) | L: 111°, centre moved 3.2 cm, rpm FL/FR/RL/RR -200/202/-190/192; R: -111°, moved 3.1 cm | ✅ PASS |
| 4WD: individual motor test | RR-06 | Commands 1, 2, 3, 4 (FL, FR, RL, RR) one after another, 0 between them | Only the selected motor receives voltage and only its wheel is driven (turning forward); the others are braked | motor voltages FL/FR/RL/RR and wheel rpm — FL: 7.5/0.0/0.0/0.0 V, rpm 150/10/16/10; FR: 0.0/7.5/0.0/0.0 V, rpm 10/151/10/16; RL: 0.0/0.0/7.5/0.0 V, rpm 19/12/143/12; RR: 0.0/0.0/0.0/7.5 V, rpm 12/19/12/144 | ✅ PASS |
| 4WD: four driven wheels, no caster, symmetrical | RR-06 | Built project and its physics model | No caster; four motors, each wheel on its own motor; FL/FR and RL/RR mirror-symmetric; identical wheels; four driven wheels in the physics model | 0 caster(s); wheels FL (75, 92) FR (75, -92) RL (-75, 92) RR (-75, -92) mm; asymmetry 0.0 mm; wheels 65×26 mm; 4 driven wheels in the model | ✅ PASS |
| Custom track (keyboard driver) | RR-04 | Student-built rounded-rectangle road; keys chosen by a scripted driver (Q/E/F, L/R) | The 4WD car responds to the keys and completes a lap | Lap in 11.4 s; 0 off-track event(s) | ✅ PASS |
| Autopilot obstacle avoidance | RR-05 | Flat area, 25 × 20 cm obstacle 1.6 m straight ahead; no keys pressed (autopilot) | Drives forward, sees the obstacle with its ultrasonic sensor and turns away before touching it | turned away 67 cm before the obstacle centre; 0 collision(s) in 8 s | ✅ PASS |

Known limitations:
- RR-03 cannot see obstacles; add an HC-SR04 and avoidance logic as an extension exercise

## Robo War / Sumo

| Test | Project | Configuration | Expected | Actual | Result |
| --- | --- | --- | --- | --- | --- |
| Edge detection (alone for 40 s) | RW-01 | Standard dohyo, no opponent | Searches for 40 s without ever leaving the ring | Stayed inside; drove 0.5 m | ✅ PASS |
| Boundary recovery | RW-01 | Starts 20 cm from the centre facing straight at the border | Edge sensors see the white border; it reverses, turns away and stays in | Stayed inside (final distance from centre 0.20 m) | ✅ PASS |
| Opponent detection, distance and attack | RW-01 | Opponent placed opposite and left passive | A forward distance sensor sees the opponent, the robot drives at it, collides and pushes it out | Sensor reading at the start: 15 cm; first contact 5.40 s; opponent out at 6.10 s | ✅ PASS |
| Match vs beginner AI | RW-01 | Standard dohyo, beginner opponent, 5 s start delay for both | Match ends by a ring-out or the time limit, decided by physics | WIN at 6.1 s; 2 collision event(s) | ✅ PASS |
| Match vs intermediate AI | RW-01 | Standard dohyo, intermediate opponent, 5 s start delay for both | Match ends by a ring-out or the time limit, decided by physics | WIN at 6.2 s; 2 collision event(s) | ✅ PASS |
| Match vs advanced AI | RW-01 | Standard dohyo, advanced opponent, 5 s start delay for both | Match ends by a ring-out or the time limit, decided by physics | WIN at 6.4 s; 2 collision event(s) | ✅ PASS |
| Match vs Beast Mode AI | RW-01 | Standard dohyo, beast opponent, 5 s start delay for both | Match ends by a ring-out or the time limit, decided by physics | WIN at 6.7 s; 2 collision event(s) | ✅ PASS |
| Edge detection (alone for 40 s) | RW-02 | Standard dohyo, no opponent | Searches for 40 s without ever leaving the ring | Stayed inside; drove 0.4 m | ✅ PASS |
| Boundary recovery | RW-02 | Starts 20 cm from the centre facing straight at the border | Edge sensors see the white border; it reverses, turns away and stays in | Stayed inside (final distance from centre 0.20 m) | ✅ PASS |
| Opponent detection, distance and attack | RW-02 | Opponent placed opposite and left passive | A forward distance sensor sees the opponent, the robot drives at it, collides and pushes it out | Sensor reading at the start: 15 cm; first contact 5.40 s; opponent out at 6.10 s | ✅ PASS |
| Match vs beginner AI | RW-02 | Standard dohyo, beginner opponent, 5 s start delay for both | Match ends by a ring-out or the time limit, decided by physics | WIN at 6.2 s; 2 collision event(s) | ✅ PASS |
| Match vs intermediate AI | RW-02 | Standard dohyo, intermediate opponent, 5 s start delay for both | Match ends by a ring-out or the time limit, decided by physics | WIN at 6.3 s; 2 collision event(s) | ✅ PASS |
| Match vs advanced AI | RW-02 | Standard dohyo, advanced opponent, 5 s start delay for both | Match ends by a ring-out or the time limit, decided by physics | WIN at 6.4 s; 2 collision event(s) | ✅ PASS |
| Match vs Beast Mode AI | RW-02 | Standard dohyo, beast opponent, 5 s start delay for both | Match ends by a ring-out or the time limit, decided by physics | WIN at 6.8 s; 2 collision event(s) | ✅ PASS |
| Edge detection (alone for 40 s) | RW-03 | Standard dohyo, no opponent | Searches for 40 s without ever leaving the ring | Stayed inside; drove 6.0 m | ✅ PASS |
| Boundary recovery | RW-03 | Starts 20 cm from the centre facing straight at the border | Edge sensors see the white border; it reverses, turns away and stays in | Stayed inside (final distance from centre 0.17 m) | ✅ PASS |
| Opponent detection, distance and attack | RW-03 | Opponent placed opposite and left passive | A forward distance sensor sees the opponent, the robot drives at it, collides and pushes it out | Sensor reading at the start: 15 cm; first contact 5.40 s; opponent out at 6.10 s | ✅ PASS |
| Match vs beginner AI | RW-03 | Standard dohyo, beginner opponent, 5 s start delay for both | Match ends by a ring-out or the time limit, decided by physics | WIN at 6.2 s; 2 collision event(s) | ✅ PASS |
| Match vs intermediate AI | RW-03 | Standard dohyo, intermediate opponent, 5 s start delay for both | Match ends by a ring-out or the time limit, decided by physics | WIN at 6.3 s; 2 collision event(s) | ✅ PASS |
| Match vs advanced AI | RW-03 | Standard dohyo, advanced opponent, 5 s start delay for both | Match ends by a ring-out or the time limit, decided by physics | WIN at 6.4 s; 2 collision event(s) | ✅ PASS |
| Match vs Beast Mode AI | RW-03 | Standard dohyo, beast opponent, 5 s start delay for both | Match ends by a ring-out or the time limit, decided by physics | WIN at 6.6 s; 2 collision event(s) | ✅ PASS |
| Distance measurement accuracy | RW-02 | Opponent passive, robot just after its start delay | Ultrasonic distance computed by the firmware (µs / 58) is within 4 cm of the simulated range | firmware: ultrasonic 10 cm, Sharp 10 cm; simulated range 9.9 cm | ✅ PASS |
| 4WD: four driven wheels, no caster, symmetrical | RW-04 | Built project and its physics model | No caster; four motors, each wheel on its own motor; FL/FR and RL/RR mirror-symmetric; identical wheels; four driven wheels in the physics model | 0 caster(s); wheels FL (30, 64) FR (30, -64) RL (-30, 64) RR (-30, -64) mm; asymmetry 0.0 mm; wheels 40×20 mm; 4 driven wheels in the model | ✅ PASS |
| Edge detection (alone for 40 s) | RW-04 | Standard dohyo, no opponent | Searches for 40 s without ever leaving the ring | Stayed inside; drove 3.6 m | ✅ PASS |
| Boundary recovery | RW-04 | Starts 20 cm from the centre facing straight at the border | Edge sensors see the white border; it reverses, turns away and stays in | Stayed inside (final distance from centre 0.18 m) | ✅ PASS |
| Pushes the opponent out (four-wheel traction) | RW-04 | Opponent placed opposite and left passive | Finds the opponent with the ultrasonic sensor, charges with all four wheels and pushes it out of the ring | first contact 5.30 s; opponent out at 5.70 s | ✅ PASS |
| Match vs beginner AI | RW-04 | Standard dohyo, beginner opponent, 5 s start delay for both | Wins against the built-in beginner AI by a ring-out | WIN at 5.7 s; 2 collision event(s) | ✅ PASS |
| Match vs intermediate AI | RW-04 | Standard dohyo, intermediate opponent, 5 s start delay for both | Match ends by a ring-out or the time limit, decided by physics | WIN at 5.9 s; 2 collision event(s) | ✅ PASS |
| Match vs advanced AI | RW-04 | Standard dohyo, advanced opponent, 5 s start delay for both | Match ends by a ring-out or the time limit, decided by physics | WIN at 6.0 s; 2 collision event(s) | ✅ PASS |
| Match vs Beast Mode AI | RW-04 | Standard dohyo, beast opponent, 5 s start delay for both | Match ends by a ring-out or the time limit, decided by physics | WIN at 6.3 s; 2 collision event(s) | ✅ PASS |

Known limitations:
- The reference robots' 25GA370 motors and sticky tyres out-push the built-in opponent robots, so head-on starts are usually decided in the first push
- The Sharp sensor is out of range (>80 cm) at the start distance and reports 999

Total runtime 100 s.
