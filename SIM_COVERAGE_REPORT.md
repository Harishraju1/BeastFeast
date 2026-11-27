# SIMULATION COVERAGE REPORT

Generated 2026-11-27T07:35:47.631Z by `npm run sim:coverage` (also checked by `tests/sim/coverage.test.ts`).

| | Count |
|---|---:|
| Components in the library | 558 |
| Fully supported (working model + functional simulation) | 195 |
| Partially supported (some behaviour, limits stated) | 306 |
| Not yet supported (no functional model) | 57 |
| Functional self-test passed | 153 |
| Functional self-test failed | 0 |
| Fully supported electrical parts without a passing self-test | 0 |
| 3D model of this exact part / family model / plain block | 190 / 106 / 262 |

Self-test = a minimal real circuit is built and simulated; the part must behave (deliver current, spin, drive, change its output, show text, hold its voltage). Wheels, casters and chassis are covered by the physics tests instead.

## Failing self-tests

None.

## Fully supported — self-test results

| Component | Kind | 3D | Self-test |
|---|---|---|---|
| Arduino Uno R3 | controller | exact | ✓ blink on pin 2 (D2) ran 7 loops |
| Arduino Uno R4 | controller | exact | ✓ blink on pin 2 (D2) ran 7 loops |
| Arduino Nano | controller | exact | ✓ blink on pin 2 (D2) ran 7 loops |
| Arduino Nano Every | controller | family | ✓ blink on pin 2 (D2) ran 7 loops |
| Arduino Pro Mini | controller | family | ✓ blink on pin 2 (D2) ran 7 loops |
| Arduino Micro | controller | family | ✓ blink on pin 2 (D2) ran 7 loops |
| Arduino Leonardo | controller | family | ✓ blink on pin 2 (D2) ran 7 loops |
| Arduino Mega 2560 | controller | exact | ✓ blink on pin 2 (D2) ran 7 loops |
| ESP32 DevKit V1 | controller | exact | ✓ blink on pin 32 (D32) ran 7 loops |
| ESP8266 NodeMCU | controller | family | ✓ blink on pin 16 (D0) ran 7 loops |
| Raspberry Pi Pico (RP2040 microcontroller board, not an SBC) | controller | exact | ✓ blink on pin 2 (GP2) ran 7 loops |
| Raspberry Pi Pico W (RP2040 microcontroller board, not an SBC) | controller | exact | ✓ blink on pin 2 (GP2) ran 7 loops |
| L298N | motor-driver | exact | ✓ channel A: 9.0 V to the motor from a 3S pack |
| L293D | motor-driver | exact | ✓ channel 1-2: 4.9 V to the motor from a 2S pack |
| TB6612FNG | motor-driver | exact | ✓ channel A: 6.6 V to the motor from a 2S pack |
| DRV8833 | motor-driver | exact | ✓ channel A: 3.2 V to the motor from a 1S pack |
| DRV8835 | motor-driver | family | ✓ channel A: 3.2 V to the motor from a 1S pack |
| DRV8871 | motor-driver | family | ✓ channel A: 6.6 V to the motor from a 2S pack |
| MX1508 | motor-driver | exact | ✓ channel A: 3.1 V to the motor from a 1S pack |
| BTS7960 | motor-driver | exact | ✓ channel A: 6.9 V to the motor from a 2S pack |
| IBT-2 | motor-driver | exact | ✓ channel A: 6.9 V to the motor from a 2S pack |
| Cytron MD10C | motor-driver | family | ✓ channel A: 6.9 V to the motor from a 2S pack |
| Cytron MDD10A | motor-driver | family | ✓ channel 1: 6.9 V to the motor from a 2S pack |
| TT Yellow Gear Motor | dc-motor | exact | ✓ 10.4 V → 346 rpm, 0.17 A |
| BO Gear Motor | dc-motor | exact | ✓ 10.4 V → 259 rpm, 0.12 A |
| N20 Micro Metal Gear Motor | dc-motor | exact | ✓ 10.4 V → 519 rpm, 0.06 A |
| 25GA370 Gear Motor | dc-motor | exact | ✓ 14.5 V → 363 rpm, 0.10 A |
| 37GB520 Gear Motor | dc-motor | exact | ✓ 14.5 V → 398 rpm, 0.16 A |
| Johnson DC Gear Motor | dc-motor | exact | ✓ 14.5 V → 361 rpm, 0.31 A |
| SG90 | servo | exact | ✓ turned to 30° |
| MG90S | servo | exact | ✓ turned to 30° |
| MG995 | servo | exact | ✓ turned to 30° |
| MG996R | servo | exact | ✓ turned to 30° |
| DS3218 | servo | exact | ✓ turned to 30° |
| DS3225 | servo | exact | ✓ turned to 30° |
| TCRT5000 | sensor | exact | ✓ output 0/51 → 1023/972 |
| QTR-1A | sensor | exact | ✓ output 51 → 972 |
| QTR-3A | sensor | exact | ✓ output 51/51/51 → 972/972/972 |
| QTR-8A | sensor | exact | ✓ output 51/51/51/51/51/51 → 972/972/972/972/972/972 |
| 3-Channel IR Sensor Array | sensor | exact | ✓ output 0/0/0 → 1023/1023/1023 |
| 5-Channel IR Sensor Array | sensor | exact | ✓ output 0/0/0/0/0 → 1023/1023/1023/1023/1023 |
| 8-Channel IR Sensor Array | sensor | exact | ✓ output 51/51/51/51/51/51 → 972/972/972/972/972/972 |
| Analog IR Sensor | sensor | exact | ✓ output 51 → 972 |
| Digital IR Sensor | sensor | exact | ✓ output 0 → 1023 |
| IR Reflectance Sensor Module | sensor | exact | ✓ output 0/51 → 1023/972 |
| HC-SR04 | sensor | exact | ✓ echo 1166 µs at 20 cm, 5831 µs at 1 m |
| HC-SR05 | sensor | exact | ✓ echo 1166 µs at 20 cm, 5831 µs at 1 m |
| US-100 | sensor | family | ✓ echo 1166 µs at 20 cm, 5831 µs at 1 m |
| JSN-SR04T | sensor | family | ✓ echo 1166 µs at 20 cm, 5831 µs at 1 m |
| Sharp GP2Y0A21YK0F | sensor | exact | ✓ output 351 → 105 |
| Sharp GP2Y0A02YK0F | sensor | exact | ✓ output 384 → 206 |
| E18-D80NK | sensor | exact | ✓ output 0 → 1023 |
| IR Obstacle Avoidance Sensor | sensor | exact | ✓ output 0 → 1023 |
| Sharp IR Distance Sensor | sensor | exact | ✓ output 351 → 105 |
| TCRT5000 Edge Detection Sensor | sensor | exact | ✓ output 0/51 → 1023/972 |
| QTR Reflectance Sensor | sensor | exact | ✓ output 51 → 972 |
| IR Proximity Sensor | sensor | exact | ✓ output 0 → 1023 |
| Ultrasonic Sensor | sensor | exact | ✓ echo 1166 µs at 20 cm, 5831 µs at 1 m |
| Bumper Switch | sensor | family | ✓ reads HIGH released, LOW pressed (INPUT_PULLUP) |
| Limit Switch | sensor | exact | ✓ reads HIGH released, LOW pressed (INPUT_PULLUP) |
| Hall Effect Encoder | sensor | family | ✓ output 0/0 → 1023/0 |
| Motor Encoder | sensor | family | ✓ output 0/0 → 1023/0 |
| Incremental Encoder | sensor | family | ✓ output 0/0 → 1023/0 |
| Limit Switch | sensor | exact | ✓ reads HIGH released, LOW pressed (INPUT_PULLUP) |
| LDR | sensor | exact | ✓ analogRead 170 (1 lux) → 984 (1000 lux) |
| DHT11 | sensor | exact | ✓ reads 30 °C / 40 % |
| DHT22 | sensor | exact | ✓ reads 30 °C / 40 % |
| 18650 Li-ion Cell | battery | exact | ✓ 8.29 V, 83 mA into 100 Ω, charge falling |
| 21700 Li-ion Cell | battery | exact | ✓ 8.30 V, 83 mA into 100 Ω, charge falling |
| 26650 Li-ion Cell | battery | exact | ✓ 8.30 V, 83 mA into 100 Ω, charge falling |
| Li-ion Battery Pack | battery | exact | ✓ 8.29 V, 83 mA into 100 Ω, charge falling |
| LiPo 1S Battery | battery | exact | ✓ 4.15 V, 41 mA into 100 Ω, charge falling |
| LiPo 2S Battery | battery | exact | ✓ 8.30 V, 83 mA into 100 Ω, charge falling |
| LiPo 3S Battery | battery | exact | ✓ 12.44 V, 124 mA into 100 Ω, charge falling |
| LiPo 4S Battery | battery | exact | ✓ 16.59 V, 166 mA into 100 Ω, charge falling |
| LiPo 6S Battery | battery | exact | ✓ 24.87 V, 249 mA into 100 Ω, charge falling |
| LiFePO4 Battery | battery | family | ✓ 7.21 V, 72 mA into 100 Ω, charge falling |
| AA Alkaline Battery | battery | exact | ✓ 6.31 V, 63 mA into 100 Ω, charge falling |
| AAA Alkaline Battery | battery | exact | ✓ 6.28 V, 63 mA into 100 Ω, charge falling |
| AA NiMH Rechargeable Battery | battery | exact | ✓ 8.27 V, 83 mA into 100 Ω, charge falling |
| AAA NiMH Rechargeable Battery | battery | exact | ✓ 8.26 V, 83 mA into 100 Ω, charge falling |
| 4 × AA Battery Pack | battery | exact | ✓ 6.31 V, 63 mA into 100 Ω, charge falling |
| 6 × AA Battery Pack | battery | exact | ✓ 9.43 V, 94 mA into 100 Ω, charge falling |
| 9V PP3 Battery | battery | exact | ✓ 9.29 V, 93 mA into 100 Ω, charge falling |
| 6V Lead Acid Battery | battery | exact | ✓ 6.36 V, 64 mA into 100 Ω, charge falling |
| 12V Lead Acid Battery | battery | exact | ✓ 12.72 V, 127 mA into 100 Ω, charge falling |
| NiCd Battery Pack | battery | family | ✓ 8.27 V, 83 mA into 100 Ω, charge falling |
| LM2596 Buck Converter | regulator | exact | ✓ 7.2 V in → 5.00 V out, 5 mA, 88 % |
| LM2577 Boost Converter | regulator | family | ✓ 7.2 V in → 12.00 V out, 12 mA, 100 % |
| MT3608 Boost Converter | regulator | family | ✓ 3.6 V in → 12.00 V out, 12 mA, 100 % |
| XL6009 Boost Converter | regulator | family | ✓ 3.6 V in → 12.00 V out, 12 mA, 100 % |
| XL4015 Buck Converter | regulator | exact | ✓ 10.8 V in → 5.00 V out, 5 mA, 88 % |
| XL4016 Buck Converter | regulator | exact | ✓ 10.8 V in → 5.00 V out, 5 mA, 88 % |
| MP1584 Buck Converter | regulator | exact | ✓ 7.2 V in → 5.00 V out, 5 mA, 88 % |
| MP2307 Buck Converter | regulator | exact | ✓ 7.2 V in → 5.00 V out, 5 mA, 88 % |
| AMS1117 3.3V Regulator | regulator | exact | ✓ 7.2 V in → 3.30 V out, 3 mA, 46 % |
| AMS1117 5V Regulator | regulator | exact | ✓ 7.2 V in → 5.00 V out, 5 mA, 69 % |
| 7805 Voltage Regulator | regulator | exact | ✓ 7.2 V in → 5.00 V out, 5 mA, 69 % |
| 7812 Voltage Regulator | regulator | exact | ✓ 14.4 V in → 12.00 V out, 12 mA, 83 % |
| 1117-3.3 Regulator | regulator | exact | ✓ 7.2 V in → 3.30 V out, 3 mA, 46 % |
| 1117-5.0 Regulator | regulator | exact | ✓ 7.2 V in → 5.00 V out, 5 mA, 69 % |
| TPS5430 Buck Converter | regulator | exact | ✓ 7.2 V in → 5.00 V out, 5 mA, 88 % |
| BEC Module | regulator | family | ✓ 7.2 V in → 5.00 V out, 5 mA, 69 % |
| UBEC Module | regulator | family | ✓ 7.2 V in → 5.00 V out, 5 mA, 69 % |
| DC-DC Converter | regulator | family | ✓ 7.2 V in → 5.00 V out, 5 mA, 69 % |
| Isolated DC-DC Converter | regulator | family | ✓ 5.0 V in → 5.00 V out, 5 mA, 100 % |
| Power Distribution Board | regulator | family | ✓ passes 3.60 V straight through |
| DC Power Jack Module | regulator | family | ✓ passes 3.60 V straight through |
| Plastic Robot Wheels | wheel | exact | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Rubber Robot Wheels | wheel | exact | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Silicone Robot Wheels | wheel | exact | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Foam Wheels | wheel | exact | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| High-Grip Racing Wheels | wheel | exact | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| High-Speed Racing Wheels | wheel | exact | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Sumo Robot Wheels | wheel | exact | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Aluminium Wheels | wheel | exact | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Metal Wheels | wheel | exact | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| TPU 3D-Printed Wheels | wheel | exact | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Mecanum Wheels | wheel | exact | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Omni Wheels | wheel | exact | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Tank Tracks | wheel | family | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Caster Wheels | caster | family | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Ball Caster Wheels | caster | exact | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Ball Transfer Units | caster | exact | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Knobby Tyres | wheel | exact | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Dual Wheel Assemblies | wheel | exact | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Hub Wheels | wheel | family | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Front Caster Wheels | caster | family | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Rear Caster Wheels | caster | family | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Custom 3D-Printed Tyres | wheel | family | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| 2WD Robot Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| 4WD Robot Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| 6WD Robot Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Acrylic Robot Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Aluminium Robot Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Steel Robot Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Stainless Steel Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Carbon Fibre Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| ABS Plastic Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| PLA 3D-Printed Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| PETG 3D-Printed Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Nylon Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Polycarbonate Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| FR4 Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Mini Sumo Robot Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Micro Sumo Robot Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Racing Robot Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Line Follower Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Tank Robot Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| Custom Fabricated Chassis | chassis | block | — Mechanical part: covered by the physics tests (tests/sim), not by an electrical self-test. |
| HC-05 Bluetooth Module | wireless | block | ✓ TX reaches the controller's RX: keyboard/phone commands arrive on Serial |
| HC-06 Bluetooth Module | wireless | block | ✓ TX reaches the controller's RX: keyboard/phone commands arrive on Serial |
| Emergency Stop Button | rc-input | block | ✓ 1–2 joined when closed, open otherwise |
| 100Ω Resistor | resistor | exact | ✓ 50.000 mA at 5 V (Ohm's law) |
| 220Ω Resistor | resistor | exact | ✓ 22.727 mA at 5 V (Ohm's law) |
| 330Ω Resistor | resistor | exact | ✓ 15.152 mA at 5 V (Ohm's law) |
| 470Ω Resistor | resistor | exact | ✓ 10.638 mA at 5 V (Ohm's law) |
| 1kΩ Resistor | resistor | exact | ✓ 5.000 mA at 5 V (Ohm's law) |
| 4.7kΩ Resistor | resistor | exact | ✓ 1.064 mA at 5 V (Ohm's law) |
| 10kΩ Resistor | resistor | exact | ✓ 0.500 mA at 5 V (Ohm's law) |
| 100kΩ Resistor | resistor | exact | ✓ 0.050 mA at 5 V (Ohm's law) |
| Variable Resistor | resistor | block | ✓ 0.500 mA at 5 V (Ohm's law) |
| Potentiometer | resistor | block | ✓ wiper at 25 % reads 256 (≈1.25 V) |
| Trimmer Potentiometer | resistor | block | ✓ wiper at 25 % reads 256 (≈1.25 V) |
| SMD Resistor | resistor | exact | ✓ 5.000 mA at 5 V (Ohm's law) |
| Ceramic Capacitor | capacitor | exact | ✓ charged to 5.00 V through 1 kΩ (τ = 0.10 ms) |
| Electrolytic Capacitor | capacitor | exact | ✓ charged to 5.00 V through 1 kΩ (τ = 1.0e+2 ms) |
| Tantalum Capacitor | capacitor | exact | ✓ charged to 5.00 V through 1 kΩ (τ = 10 ms) |
| Film Capacitor | capacitor | exact | ✓ charged to 5.00 V through 1 kΩ (τ = 1.0 ms) |
| SMD Capacitor | capacitor | exact | ✓ charged to 5.00 V through 1 kΩ (τ = 0.10 ms) |
| LED Diode | led | exact | ✓ 12.9 mA through 220 Ω, lit |
| Red LED | led | exact | ✓ 12.9 mA through 220 Ω, lit |
| Green LED | led | exact | ✓ 12.5 mA through 220 Ω, lit |
| Blue LED | led | exact | ✓ 8.6 mA through 220 Ω, lit |
| Yellow LED | led | exact | ✓ 12.5 mA through 220 Ω, lit |
| White LED | led | exact | ✓ 8.2 mA through 220 Ω, lit |
| RGB LED | led | block | ✓ 12.9 mA through 220 Ω, lit |
| 16×2 LCD Display | display | exact | ✓ shows “OK” |
| 20×4 LCD Display | display | exact | ✓ shows “OK” |
| Push Button Switch | switch | exact | ✓ 1–2 joined when closed, open otherwise |
| Toggle Switch | switch | exact | ✓ 1–2 joined when closed, open otherwise |
| Rocker Switch | switch | block | ✓ 1–2 joined when closed, open otherwise |
| Slide Switch | switch | block | ✓ COM–A joined when closed, open otherwise |
| Limit Switch | switch | block | ✓ reads HIGH released, LOW pressed (INPUT_PULLUP) |
| Emergency Stop Switch | switch | block | ✓ 1–2 joined when closed, open otherwise |
| Micro Switch | switch | block | ✓ COM–NO joined when closed, open otherwise |
| 16×2 LCD | display | exact | ✓ shows “OK” |
| 20×4 LCD | display | exact | ✓ shows “OK” |
| I2C LCD Module | display | exact | ✓ shows “OK” |
| 11.1V 2100mAh LiPo Battery (3S) | battery | exact | ✓ 12.44 V, 124 mA into 100 Ω, charge falling |
| 18650 Single Cell Battery | battery | exact | ✓ 4.14 V, 41 mA into 100 Ω, charge falling |
| 18650 Double Cell Battery | battery | exact | ✓ 8.27 V, 83 mA into 100 Ω, charge falling |
| 18650 Triple Cell Battery | battery | exact | ✓ 12.40 V, 124 mA into 100 Ω, charge falling |
| 18650 Four Cell Battery | battery | exact | ✓ 16.53 V, 165 mA into 100 Ω, charge falling |
| 18650 Five Cell Battery | battery | exact | ✓ 20.65 V, 206 mA into 100 Ω, charge falling |

## Partially supported and not yet supported

| Component | Level | Limitation | Alternative |
|---|---|---|---|
| ESP32-WROOM-32 | not yet | No pin definitions yet (an administrator can add them). | Arduino Uno R3 |
| ESP32-S3 | not yet | No pin definitions yet (an administrator can add them). | Arduino Uno R3 |
| ESP32-C3 | not yet | No pin definitions yet (an administrator can add them). | Arduino Uno R3 |
| ESP-01 | partial | Your code is not executed on this board in the simulator yet. | Arduino Uno R3 |
| Seeed Studio XIAO ESP32-C3 | not yet | No pin definitions yet (an administrator can add them). | Arduino Uno R3 |
| Seeed Studio XIAO ESP32-S3 | not yet | No pin definitions yet (an administrator can add them). | Arduino Uno R3 |
| Seeed Studio XIAO RP2040 | not yet | No pin definitions yet (an administrator can add them). | Arduino Uno R3 |
| STM32 Blue Pill | not yet | No pin definitions yet (an administrator can add them). | Arduino Uno R3 |
| STM32 Nucleo | not yet | No pin definitions yet (an administrator can add them). | Arduino Uno R3 |
| Teensy 4.0 | not yet | No pin definitions yet (an administrator can add them). | Arduino Uno R3 |
| Teensy 4.1 | not yet | No pin definitions yet (an administrator can add them). | Arduino Uno R3 |
| ATtiny85 | partial | Your code is not executed on this board in the simulator yet. | Arduino Uno R3 |
| RP2040 Zero | not yet | No pin definitions yet (an administrator can add them). | Arduino Uno R3 |
| Arduino Due | partial | Your code is not executed on this board in the simulator yet. | Arduino Uno R3 |
| nRF52840 Development Board | not yet | No pin definitions yet (an administrator can add them). | Arduino Uno R3 |
| L293D Motor Shield | not yet | No pin definitions yet (an administrator can add them). | L293D |
| DRV8876 | partial | Its outputs are not driven in the simulator, so motors on it will not move. | L298N |
| VNH2SP30 | not yet | No pin definitions yet (an administrator can add them). | L298N |
| VNH5019 | not yet | No pin definitions yet (an administrator can add them). | L298N |
| MC33926 | not yet | No pin definitions yet (an administrator can add them). | L298N |
| A4950 | partial | Its outputs are not driven in the simulator, so motors on it will not move. | L298N |
| TB67H450FNG | partial | Its outputs are not driven in the simulator, so motors on it will not move. | L298N |
| DRV8251 | partial | Its outputs are not driven in the simulator, so motors on it will not move. | L298N |
| DRV8243 | not yet | No pin definitions yet (an administrator can add them). | L298N |
| A4988 | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| DRV8825 | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| TMC2208 | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| TMC2209 | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| ULN2003 | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| TB6600 | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| BLDC ESC | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| Brushless ESC with BEC | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| Brushless ESC without BEC | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| N10 Micro Gear Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | N20 Micro Metal Gear Motor |
| RS-130 DC Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | TT Yellow Gear Motor |
| RS-180 DC Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | TT Yellow Gear Motor |
| RS-280 DC Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | TT Yellow Gear Motor |
| RS-380 DC Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | TT Yellow Gear Motor |
| RS-385 DC Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | TT Yellow Gear Motor |
| RS-540 DC Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | TT Yellow Gear Motor |
| RS-550 DC Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | TT Yellow Gear Motor |
| RS-555 DC Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | TT Yellow Gear Motor |
| RS-775 DC Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | TT Yellow Gear Motor |
| Micro DC Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | N20 Micro Metal Gear Motor |
| High-RPM DC Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | TT Yellow Gear Motor |
| High-Torque DC Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | TT Yellow Gear Motor |
| Coreless DC Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | TT Yellow Gear Motor |
| Worm Gear Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | TT Yellow Gear Motor |
| Planetary Gear Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | TT Yellow Gear Motor |
| Hub Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | TT Yellow Gear Motor |
| Brushed DC Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | TT Yellow Gear Motor |
| Brushless DC Motor | partial | No verified speed/torque data, so it cannot spin in the simulator. Enter its datasheet values as custom parameters, or use the suggested motor. | TT Yellow Gear Motor |
| Continuous Rotation Servo | partial | Servo torque, speed and load are not modelled. | — |
| NEMA 17 | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| NEMA 23 | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| 28BYJ-48 | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| NEMA 14 | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| CNY70 | partial | Its readings are not generated from the simulated world. | 3-Channel IR Sensor Array |
| QTR-1RC | partial | Its readings are not generated from the simulated world. | QTR-1A |
| QTR-3RC | partial | Its readings are not generated from the simulated world. | QTR-1A |
| QTR-5RC | partial | Its readings are not generated from the simulated world. | 3-Channel IR Sensor Array |
| QTR-8RC | partial | Its readings are not generated from the simulated world. | 3-Channel IR Sensor Array |
| QTRX-HD Sensor Array | not yet | No pin definitions yet (an administrator can add them). | 3-Channel IR Sensor Array |
| VL53L0X | partial | Its readings are not generated from the simulated world. | IR Obstacle Avoidance Sensor |
| VL53L1X | partial | Its readings are not generated from the simulated world. | HC-SR04 |
| VL53L4CD | partial | Its readings are not generated from the simulated world. | HC-SR04 |
| Laser Distance Sensor | not yet | No pin definitions yet (an administrator can add them). | IR Obstacle Avoidance Sensor |
| LiDAR Sensor | not yet | No pin definitions yet (an administrator can add them). | IR Obstacle Avoidance Sensor |
| TFmini-S LiDAR | partial | Its readings are not generated from the simulated world. | HC-SR04 |
| LD06 LiDAR | not yet | No pin definitions yet (an administrator can add them). | HC-SR04 |
| Capacitive Proximity Sensor | partial | Its readings are not generated from the simulated world. | IR Obstacle Avoidance Sensor |
| Inductive Proximity Sensor | partial | Its readings are not generated from the simulated world. | IR Obstacle Avoidance Sensor |
| Photoelectric Sensor | partial | Its readings are not generated from the simulated world. | IR Obstacle Avoidance Sensor |
| ToF Distance Sensor | partial | Its readings are not generated from the simulated world. | Sharp IR Distance Sensor |
| Hall Effect Sensor | partial | Its readings are not generated from the simulated world. | Sharp IR Distance Sensor |
| Magnetic Proximity Sensor | partial | Its readings are not generated from the simulated world. | IR Proximity Sensor |
| MPU6050 | partial | Its readings are not generated from the simulated world. | TCRT5000 |
| MPU9250 | partial | Its readings are not generated from the simulated world. | TCRT5000 |
| MPU6500 | partial | Its readings are not generated from the simulated world. | TCRT5000 |
| ICM-20948 | partial | Its readings are not generated from the simulated world. | TCRT5000 |
| ICM-42688 | partial | Its readings are not generated from the simulated world. | TCRT5000 |
| LSM6DS3 | partial | Its readings are not generated from the simulated world. | TCRT5000 |
| ADXL345 | partial | Its readings are not generated from the simulated world. | TCRT5000 |
| BNO055 | partial | Its readings are not generated from the simulated world. | TCRT5000 |
| BNO085 | partial | Its readings are not generated from the simulated world. | TCRT5000 |
| LIS3DH | partial | Its readings are not generated from the simulated world. | TCRT5000 |
| L3G4200D | partial | Its readings are not generated from the simulated world. | TCRT5000 |
| Optical Rotary Encoder | partial | Its readings are not generated from the simulated world. | Hall Effect Encoder |
| Magnetic Rotary Encoder | not yet | No pin definitions yet (an administrator can add them). | Hall Effect Encoder |
| Absolute Encoder | not yet | No pin definitions yet (an administrator can add them). | Hall Effect Encoder |
| KY-003 Hall Sensor | partial | Its readings are not generated from the simulated world. | Hall Effect Encoder |
| Rotary Potentiometer | partial | Its readings are not generated from the simulated world. | Hall Effect Encoder |
| INA219 | partial | Its readings are not generated from the simulated world. | TCRT5000 |
| INA226 | partial | Its readings are not generated from the simulated world. | TCRT5000 |
| ACS712 | partial | Its readings are not generated from the simulated world. | 3-Channel IR Sensor Array |
| ACS758 | not yet | No pin definitions yet (an administrator can add them). | TCRT5000 |
| Voltage Sensor Module | partial | Its readings are not generated from the simulated world. | IR Reflectance Sensor Module |
| Thermistor | not yet | No pin definitions yet (an administrator can add them). | TCRT5000 |
| DS18B20 | partial | The OneWire / DallasTemperature libraries are not emulated, so it gives no reading. Use a DHT11 or DHT22 for temperature. | 3-Channel IR Sensor Array |
| Sound Sensor | partial | Its readings are not generated from the simulated world. | 3-Channel IR Sensor Array |
| Microphone Module | partial | Its readings are not generated from the simulated world. | IR Reflectance Sensor Module |
| Vibration Sensor | partial | Its readings are not generated from the simulated world. | 3-Channel IR Sensor Array |
| SW-420 Vibration Sensor | partial | Its readings are not generated from the simulated world. | 3-Channel IR Sensor Array |
| Flame Sensor | partial | Its readings are not generated from the simulated world. | 3-Channel IR Sensor Array |
| Rain Sensor | partial | Its readings are not generated from the simulated world. | 3-Channel IR Sensor Array |
| LiFePO4 Battery Pack | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | Li-ion Battery Pack |
| 18650 Single Cell Holder | not yet | No pin definitions yet (an administrator can add them). | — |
| 18650 Dual Cell Holder | not yet | No pin definitions yet (an administrator can add them). | — |
| 18650 Triple Cell Holder | not yet | No pin definitions yet (an administrator can add them). | — |
| 18650 Four Cell Holder | not yet | No pin definitions yet (an administrator can add them). | — |
| LiPo Battery Connector | partial | Not part of the electrical simulation. | — |
| XT30 Connector | partial | Not part of the electrical simulation. | — |
| XT60 Connector | partial | Not part of the electrical simulation. | — |
| JST Connector | partial | Not part of the electrical simulation. | — |
| Battery Protection Circuit | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| Battery Management System (BMS) | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| LiPo Balance Charger | partial | Not part of the electrical simulation. | — |
| Li-ion Battery Charger | partial | Not part of the electrical simulation. | — |
| TP4056 Charging Module | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| Battery Voltage Indicator | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| Battery Level Monitor | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| Battery Checker | partial | Not part of the electrical simulation. | — |
| Battery Strap | not yet | No pin definitions yet (an administrator can add them). | — |
| Battery Mounting Holder | not yet | No pin definitions yet (an administrator can add them). | — |
| Battery Fuse | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| LM317 Adjustable Regulator | partial | The output voltage is not simulated. | — |
| Power Management Module | not yet | No pin definitions yet (an administrator can add them). | — |
| Voltage Regulator Module | not yet | No pin definitions yet (an administrator can add them). | — |
| Battery Monitoring Module | not yet | No pin definitions yet (an administrator can add them). | — |
| USB Power Module | partial | The output voltage is not simulated. | — |
| Rubber Wheel Hubs | partial | Not part of the electrical simulation. | — |
| Aluminium Wheel Hubs | partial | Not part of the electrical simulation. | — |
| Motor Mounting Brackets | partial | Not part of the electrical simulation. | — |
| Servo Mounting Brackets | partial | Not part of the electrical simulation. | — |
| Sensor Mounting Brackets | partial | Not part of the electrical simulation. | — |
| Battery Mounting Brackets | partial | Not part of the electrical simulation. | — |
| L-Brackets | partial | Not part of the electrical simulation. | — |
| U-Brackets | partial | Not part of the electrical simulation. | — |
| Motor Clamps | partial | Not part of the electrical simulation. | — |
| Aluminium Standoffs | partial | Not part of the electrical simulation. | — |
| Nylon Standoffs | partial | Not part of the electrical simulation. | — |
| Spacers | partial | Not part of the electrical simulation. | — |
| Shaft Couplers | partial | Not part of the electrical simulation. | — |
| Wheel Hubs | partial | Not part of the electrical simulation. | — |
| Axles | partial | Not part of the electrical simulation. | — |
| Ball Bearings | partial | Not part of the electrical simulation. | — |
| Roller Bearings | partial | Not part of the electrical simulation. | — |
| Bushings | partial | Not part of the electrical simulation. | — |
| Springs | partial | Not part of the electrical simulation. | — |
| Rubber Dampers | partial | Not part of the electrical simulation. | — |
| Vibration Isolators | partial | Not part of the electrical simulation. | — |
| Threaded Rods | partial | Not part of the electrical simulation. | — |
| Aluminium Profiles | partial | Not part of the electrical simulation. | — |
| Cable Clamps | partial | Not part of the electrical simulation. | — |
| Cable Holders | partial | Not part of the electrical simulation. | — |
| Battery Straps | partial | Not part of the electrical simulation. | — |
| Suspension Components | partial | Not part of the electrical simulation. | — |
| Front Wedge | partial | Not part of the electrical simulation. | — |
| Replaceable Sumo Blade | partial | Not part of the electrical simulation. | — |
| Protective Bumper | partial | Not part of the electrical simulation. | — |
| Motor Gearbox Mounts | partial | Not part of the electrical simulation. | — |
| Structural Plates | partial | Not part of the electrical simulation. | — |
| HM-10 BLE Module | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | HC-05 Bluetooth Module |
| ESP-01 Wi-Fi Module | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | HC-05 Bluetooth Module |
| ESP8266 Wi-Fi Module | not yet | No pin definitions yet (an administrator can add them). | HC-05 Bluetooth Module |
| NRF24L01 Module | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | HC-05 Bluetooth Module |
| NRF24L01+ PA/LNA Module | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | HC-05 Bluetooth Module |
| HC-12 RF Module | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | HC-05 Bluetooth Module |
| 433MHz RF Transmitter | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | HC-05 Bluetooth Module |
| 433MHz RF Receiver | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | HC-05 Bluetooth Module |
| CC1101 RF Module | not yet | No pin definitions yet (an administrator can add them). | HC-05 Bluetooth Module |
| SX1278 LoRa Module | not yet | No pin definitions yet (an administrator can add them). | HC-05 Bluetooth Module |
| SX1262 LoRa Module | not yet | No pin definitions yet (an administrator can add them). | HC-05 Bluetooth Module |
| nRF52840 BLE Module | not yet | No pin definitions yet (an administrator can add them). | HC-05 Bluetooth Module |
| IR Transmitter Module | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | HC-05 Bluetooth Module |
| IR Receiver Module | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | HC-05 Bluetooth Module |
| Wi-Fi Transceiver Module | not yet | No pin definitions yet (an administrator can add them). | HC-05 Bluetooth Module |
| Bluetooth BLE Transceiver | not yet | No pin definitions yet (an administrator can add them). | HC-05 Bluetooth Module |
| 2.4GHz RF Receiver | not yet | No pin definitions yet (an administrator can add them). | HC-05 Bluetooth Module |
| RC Receiver | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | HC-05 Bluetooth Module |
| SBUS Receiver | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | HC-05 Bluetooth Module |
| PPM Receiver | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | HC-05 Bluetooth Module |
| FlySky Receiver | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | HC-05 Bluetooth Module |
| ESP-NOW Communication | not yet | No pin definitions yet (an administrator can add them). | HC-05 Bluetooth Module |
| HW-504 Joystick Module | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | Emergency Stop Button |
| Dual-Axis Joystick | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | Emergency Stop Button |
| Single-Axis Joystick | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | Emergency Stop Button |
| PS2 Joystick Controller | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | Emergency Stop Button |
| RC Transmitter | not yet | No pin definitions yet (an administrator can add them). | Emergency Stop Button |
| RC Receiver | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | Emergency Stop Button |
| 2.4GHz Wireless Controller | not yet | No pin definitions yet (an administrator can add them). | Emergency Stop Button |
| Bluetooth Gamepad | not yet | No pin definitions yet (an administrator can add them). | Emergency Stop Button |
| Wireless Gamepad | not yet | No pin definitions yet (an administrator can add them). | Emergency Stop Button |
| USB Game Controller | not yet | No pin definitions yet (an administrator can add them). | Emergency Stop Button |
| Push-Button Control Panel | not yet | No pin definitions yet (an administrator can add them). | Emergency Stop Button |
| Toggle Switch Control Panel | not yet | No pin definitions yet (an administrator can add them). | Emergency Stop Button |
| Potentiometer Speed Controller | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | Emergency Stop Button |
| Wireless Handheld Controller | not yet | No pin definitions yet (an administrator can add them). | Emergency Stop Button |
| Steering Wheel Controller | not yet | No pin definitions yet (an administrator can add them). | Emergency Stop Button |
| Start Button | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | Emergency Stop Button |
| Stop Button | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | Emergency Stop Button |
| Speed Control Knob | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | Emergency Stop Button |
| Direction Control Switch | partial | Radio links are not simulated (Bluetooth serial modules on the UART pins are). | Emergency Stop Button |
| 1N4007 Diode | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| 1N4148 Diode | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| Schottky Diode | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| Zener Diode | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| TVS Diode | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| Flyback Diode | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| BC547 | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| BC557 | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| 2N2222 | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| TIP122 | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| TIP127 | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| NPN Transistor | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| PNP Transistor | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| IRFZ44N | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| IRLZ44N | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| IRF540N | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| AO3400 | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| IRLZ34N | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| N-Channel MOSFET | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| P-Channel MOSFET | partial | Its internal behaviour (switching, amplification, filtering …) is not modelled. | — |
| WS2812B LED Strip | partial | Addressable / protocol-driven LEDs are not rendered. | — |
| LED Indicator Module | partial | Addressable / protocol-driven LEDs are not rendered. | — |
| Seven-Segment Display | partial | Pixels / characters are not rendered. | — |
| 0.96-inch OLED Display | partial | Graphics (drawLine, drawRect, bitmaps, fonts) are not rendered — only text. | — |
| 1.3-inch OLED Display | partial | Graphics (drawLine, drawRect, bitmaps, fonts) are not rendered — only text. | — |
| DIP Switch | partial | Multi-position / multi-pole switching (DIP, rotary) is not modelled. | Limit Switch |
| Rotary Switch | partial | Multi-position / multi-pole switching (DIP, rotary) is not modelled. | Limit Switch |
| Male-to-Male Jumper Wires | partial | Not part of the electrical simulation. | — |
| Male-to-Female Jumper Wires | partial | Not part of the electrical simulation. | — |
| Female-to-Female Jumper Wires | partial | Not part of the electrical simulation. | — |
| Dupont Wires | partial | Not part of the electrical simulation. | — |
| Silicone Wires | partial | Not part of the electrical simulation. | — |
| Hookup Wires | partial | Not part of the electrical simulation. | — |
| Ribbon Cables | partial | Not part of the electrical simulation. | — |
| JST Connectors | partial | Not part of the electrical simulation. | — |
| XT30 Connectors | partial | Not part of the electrical simulation. | — |
| XT60 Connectors | partial | Not part of the electrical simulation. | — |
| DC Barrel Connectors | partial | Not part of the electrical simulation. | — |
| Screw Terminal Blocks | partial | Not part of the electrical simulation. | — |
| PCB Terminal Blocks | partial | Not part of the electrical simulation. | — |
| Male Pin Headers | partial | Not part of the electrical simulation. | — |
| Female Pin Headers | partial | Not part of the electrical simulation. | — |
| Right-Angle Pin Headers | partial | Not part of the electrical simulation. | — |
| USB Type-A Cable | partial | Not part of the electrical simulation. | — |
| USB Type-C Cable | partial | Not part of the electrical simulation. | — |
| Micro USB Cable | partial | Not part of the electrical simulation. | — |
| DC Power Cable | partial | Not part of the electrical simulation. | — |
| Battery Connectors | partial | Not part of the electrical simulation. | — |
| Motor Connectors | partial | Not part of the electrical simulation. | — |
| Crimp Terminals | partial | Not part of the electrical simulation. | — |
| Spade Connectors | partial | Not part of the electrical simulation. | — |
| Ring Terminals | partial | Not part of the electrical simulation. | — |
| Heat-Shrink Tubes | partial | Not part of the electrical simulation. | — |
| Cable Sleeves | partial | Not part of the electrical simulation. | — |
| Wire Ferrules | partial | Not part of the electrical simulation. | — |
| Cable Ties | partial | Not part of the electrical simulation. | — |
| Wire Clips | partial | Not part of the electrical simulation. | — |
| Breadboard | partial | Not part of the electrical simulation. | — |
| Mini Breadboard | partial | Not part of the electrical simulation. | — |
| Full-Size Breadboard | partial | Not part of the electrical simulation. | — |
| Zero PCB | partial | Not part of the electrical simulation. | — |
| Dot PCB | partial | Not part of the electrical simulation. | — |
| Stripboard | partial | Not part of the electrical simulation. | — |
| Perfboard | partial | Not part of the electrical simulation. | — |
| Prototype PCB | partial | Not part of the electrical simulation. | — |
| Custom PCB | partial | Not part of the electrical simulation. | — |
| Single-Sided PCB | partial | Not part of the electrical simulation. | — |
| Double-Sided PCB | partial | Not part of the electrical simulation. | — |
| FR4 PCB | partial | Not part of the electrical simulation. | — |
| SMD Prototype Board | partial | Not part of the electrical simulation. | — |
| Screw Terminal PCB | partial | Not part of the electrical simulation. | — |
| Arduino Prototype Shield | partial | Not part of the electrical simulation. | — |
| ESP32 Prototype Shield | partial | Not part of the electrical simulation. | — |
| PCB Mounting Standoffs | partial | Not part of the electrical simulation. | — |
| PCB Spacers | partial | Not part of the electrical simulation. | — |
| PCB Headers | partial | Not part of the electrical simulation. | — |
| PCB Sockets | partial | Not part of the electrical simulation. | — |
| 0.96-inch OLED | partial | Graphics (drawLine, drawRect, bitmaps, fonts) are not rendered — only text. | — |
| 1.3-inch OLED | partial | Graphics (drawLine, drawRect, bitmaps, fonts) are not rendered — only text. | — |
| 1.5-inch OLED | partial | Graphics (drawLine, drawRect, bitmaps, fonts) are not rendered — only text. | — |
| TFT LCD Display | not yet | No pin definitions yet (an administrator can add them). | — |
| SPI TFT Display | not yet | No pin definitions yet (an administrator can add them). | — |
| Seven-Segment Display | partial | Pixels / characters are not rendered. | — |
| Four-Digit Seven-Segment Display | partial | Pixels / characters are not rendered. | — |
| RGB LED Matrix | not yet | No pin definitions yet (an administrator can add them). | — |
| WS2812B LED Matrix | partial | Pixels / characters are not rendered. | — |
| Touchscreen Display | not yet | No pin definitions yet (an administrator can add them). | — |
| LED Bar Graph | not yet | No pin definitions yet (an administrator can add them). | — |
| Battery Level Display | partial | Pixels / characters are not rendered. | — |
| Digital Voltage Display | partial | Pixels / characters are not rendered. | — |
| M2 Screws | partial | Not part of the electrical simulation. | — |
| M2.5 Screws | partial | Not part of the electrical simulation. | — |
| M3 Screws | partial | Not part of the electrical simulation. | — |
| M4 Screws | partial | Not part of the electrical simulation. | — |
| M5 Screws | partial | Not part of the electrical simulation. | — |
| M6 Screws | partial | Not part of the electrical simulation. | — |
| Hex Nuts | partial | Not part of the electrical simulation. | — |
| Lock Nuts | partial | Not part of the electrical simulation. | — |
| Wing Nuts | partial | Not part of the electrical simulation. | — |
| Washers | partial | Not part of the electrical simulation. | — |
| Spring Washers | partial | Not part of the electrical simulation. | — |
| Nylon Nuts | partial | Not part of the electrical simulation. | — |
| Threaded Inserts | partial | Not part of the electrical simulation. | — |
| Heat-Set Inserts | partial | Not part of the electrical simulation. | — |
| Aluminium Rods | partial | Not part of the electrical simulation. | — |
| Steel Rods | partial | Not part of the electrical simulation. | — |
| Aluminium Sheets | partial | Not part of the electrical simulation. | — |
| Acrylic Sheets | partial | Not part of the electrical simulation. | — |
| Carbon Fibre Sheets | partial | Not part of the electrical simulation. | — |
| PLA Filament | partial | Not part of the electrical simulation. | — |
| PETG Filament | partial | Not part of the electrical simulation. | — |
| TPU Filament | partial | Not part of the electrical simulation. | — |
| ABS Filament | partial | Not part of the electrical simulation. | — |
| Nylon Filament | partial | Not part of the electrical simulation. | — |
| Epoxy Adhesive | partial | Not part of the electrical simulation. | — |
| Super Glue | partial | Not part of the electrical simulation. | — |
| Double-Sided Tape | partial | Not part of the electrical simulation. | — |
| Velcro Straps | partial | Not part of the electrical simulation. | — |
| Rubber Sheets | partial | Not part of the electrical simulation. | — |
| Silicone Sheets | partial | Not part of the electrical simulation. | — |
| Digital Multimeter | partial | Not part of the electrical simulation. | — |
| Clamp Meter | partial | Not part of the electrical simulation. | — |
| DC Bench Power Supply | partial | Not part of the electrical simulation. | — |
| Oscilloscope | partial | Not part of the electrical simulation. | — |
| Logic Analyser | partial | Not part of the electrical simulation. | — |
| USB-to-TTL Converter | partial | Not part of the electrical simulation. | — |
| Soldering Iron | partial | Not part of the electrical simulation. | — |
| Soldering Station | partial | Not part of the electrical simulation. | — |
| Hot Air Rework Station | partial | Not part of the electrical simulation. | — |
| Solder Wire | partial | Not part of the electrical simulation. | — |
| Flux | partial | Not part of the electrical simulation. | — |
| Desoldering Pump | partial | Not part of the electrical simulation. | — |
| Desoldering Wick | partial | Not part of the electrical simulation. | — |
| Wire Stripper | partial | Not part of the electrical simulation. | — |
| Wire Cutter | partial | Not part of the electrical simulation. | — |
| Side Cutter | partial | Not part of the electrical simulation. | — |
| Nose Pliers | partial | Not part of the electrical simulation. | — |
| Combination Pliers | partial | Not part of the electrical simulation. | — |
| Crimping Tool | partial | Not part of the electrical simulation. | — |
| Screwdriver Set | partial | Not part of the electrical simulation. | — |
| Allen Key Set | partial | Not part of the electrical simulation. | — |
| Spanner Set | partial | Not part of the electrical simulation. | — |
| Vernier Caliper | partial | Not part of the electrical simulation. | — |
| Digital Weighing Scale | partial | Not part of the electrical simulation. | — |
| Hot Glue Gun | partial | Not part of the electrical simulation. | — |
| Heat Gun | partial | Not part of the electrical simulation. | — |
| Drill Machine | partial | Not part of the electrical simulation. | — |
| Mini Hand Drill | partial | Not part of the electrical simulation. | — |
| 3D Printer | partial | Not part of the electrical simulation. | — |
| Digital Tachometer | partial | Not part of the electrical simulation. | — |
| LiPo Battery Checker | partial | Not part of the electrical simulation. | — |
| LiPo Balance Charger | partial | Not part of the electrical simulation. | — |
| Battery Internal Resistance Tester | partial | Not part of the electrical simulation. | — |
| Helping Hands Tool | partial | Not part of the electrical simulation. | — |
| PCB Holder | partial | Not part of the electrical simulation. | — |
| Mini Bench Vice | partial | Not part of the electrical simulation. | — |
| Cutting Mat | partial | Not part of the electrical simulation. | — |
| Hacksaw | partial | Not part of the electrical simulation. | — |
| File Set | partial | Not part of the electrical simulation. | — |
| Safety Goggles | partial | Not part of the electrical simulation. | — |
