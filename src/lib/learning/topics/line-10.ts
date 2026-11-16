import { defineTopic } from "../define";
import type { Topic } from "../types";

export const LINE_10: Topic[] = [
  defineTopic("line", 10, {
    slug: "microcontrollers",
    title: "Microcontrollers",
    minutes: 10,
    summary: "A microcontroller is a complete small computer on one chip — CPU, memory and I/O peripherals — that runs one program in a loop to control your robot.",
    introduction: `The microcontroller is the decision-maker of your robot. It is not a full computer like a laptop: it has no operating system, a tiny amount of memory and runs a single program. But it starts in milliseconds, reacts in microseconds and has built-in hardware for reading sensors and driving motors.

This topic compares the microcontrollers used in the club — the ATmega328P on the Arduino Uno and Nano, and the ESP32 — and explains the hardware blocks you will use in every project.`,
    beginner: `Picture a very dedicated worker in a small control room. The worker has a short instruction sheet (your program), a tiny notepad for scribbling numbers (RAM), a filing cabinet that keeps the instruction sheet even when the lights go out (flash memory), and a wall of switches and dials connected to the outside world (input and output pins). The worker reads the instructions from top to bottom, again and again, millions of steps per second, never getting bored.

That is a microcontroller. It is a whole computer squeezed into one chip: a processor, memory and input/output hardware. Your Arduino Uno contains one called the ATmega328P. When you click Upload in the Arduino IDE, your program is copied into its flash memory. When the board powers up, it runs setup() once and then loop() forever.

Different microcontrollers are like workers with different skills. The ATmega328P is simple, robust and uses 5 V signals, which makes it easy to connect to most hobby sensors and motor drivers. The ESP32 is much faster, has far more memory and built-in Wi-Fi and Bluetooth, but uses 3.3 V signals, so you must be careful when connecting 5 V parts to it.`,
    technical: [
      {
        heading: "Inside a microcontroller",
        body: `- CPU core: executes instructions. The ATmega328P is an 8-bit AVR core running at 16 MHz on the Uno; most instructions take one or two clock cycles.
- Flash: non-volatile program storage. ATmega328P: 32 KB (0.5 KB used by the Arduino bootloader).
- SRAM: working memory for variables. ATmega328P: 2 KB — large arrays and many String objects can exhaust it.
- EEPROM: small non-volatile data storage (1 KB on the ATmega328P), useful for saving calibration values.
- Peripherals: GPIO ports, a 10-bit ADC, timers that generate PWM, UART (Serial), SPI, I2C, external interrupts.`,
      },
      {
        heading: "ATmega328P vs ESP32",
        body: `ATmega328P (Uno/Nano): 8-bit, 16 MHz, 5 V logic, 10-bit ADC (0–1023), 6 PWM pins, very predictable timing, tolerant of beginners' mistakes.

ESP32: 32-bit, dual-core, commonly 240 MHz, 3.3 V logic, 12-bit ADC (0–4095, less linear near the ends), Wi-Fi and Bluetooth, flexible PWM on most pins. Its pins are not designed for 5 V signals — use a voltage divider or level shifter on 5 V sensor outputs, and pick motor drivers that accept 3.3 V logic.

Data sizes matter: on AVR an int is 16-bit (−32768…32767), on ESP32 it is 32-bit. A byte is 8-bit (0…255) on both.`,
      },
      {
        heading: "Program execution and timing",
        body: `After reset the bootloader briefly checks for an upload, then runs setup() once and loop() repeatedly. Everything in loop() competes for time: Serial.print at 9600 baud takes roughly 1 ms per character, delay() blocks completely, and analogRead takes about 100 µs on the Uno.

Timers run independently of your code. Timer0 drives millis() and micros() and the PWM on pins 5 and 6; Timer1 drives pins 9 and 10; Timer2 drives pins 3 and 11. Some libraries take over timers, which can disable PWM on certain pins.`,
      },
    ],
    workingPrinciple: `A microcontroller fetches instructions from flash memory, decodes them and executes them, reading and writing registers that are wired to physical pins and peripherals. Writing a 1 to a port register makes a pin output 5 V; reading an input register returns the logic levels on the pins; configuring a timer register makes hardware produce PWM without CPU attention. Your Arduino sketch is compiled into these instructions and runs in an endless loop.`,
    diagrams: [
      { kind: "flow", steps: ["Power on / reset", "Bootloader checks for new upload", "setup() runs once: pinMode, Serial.begin", "loop() runs: read sensors", "loop(): compute decision", "loop(): write outputs", "Back to start of loop()"] },
      {
        kind: "circuit",
        nodes: [
          { id: "cpu", label: "CPU (8-bit AVR, 16 MHz)", x: 240, y: 40 },
          { id: "flash", label: "Flash 32 KB", x: 60, y: 140 },
          { id: "sram", label: "SRAM 2 KB", x: 240, y: 140 },
          { id: "eeprom", label: "EEPROM 1 KB", x: 420, y: 140 },
          { id: "periph", label: "GPIO / ADC / Timers / UART / SPI / I2C", x: 240, y: 260 },
        ],
        edges: [
          { from: "cpu", to: "flash", label: "instructions" },
          { from: "cpu", to: "sram", label: "variables" },
          { from: "cpu", to: "eeprom", label: "saved settings" },
          { from: "cpu", to: "periph", label: "registers" },
        ],
      },
    ],
    examples: [
      {
        title: "Measuring your loop speed",
        body: "Knowing how fast loop() runs tells you how often the robot checks its sensors. This sketch counts loops per second.",
        code: `unsigned long loops = 0;
unsigned long lastReport = 0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  loops++;
  analogRead(A0);                   // a typical sensor read
  if (millis() - lastReport >= 1000) {
    Serial.println(loops);          // loops completed in the last second
    loops = 0;
    lastReport = millis();
  }
}`,
      },
      {
        title: "Saving a calibration value in EEPROM",
        body: "EEPROM keeps data after power-off, so a sensor threshold measured at the track can be reused next time.",
        code: `#include <EEPROM.h>

void setup() {
  Serial.begin(9600);
  int threshold = 512;
  EEPROM.put(0, threshold);   // store at address 0
  int loaded = 0;
  EEPROM.get(0, loaded);      // read it back
  Serial.println(loaded);     // 512
}

void loop() {}`,
      },
    ],
    commonMistakes: [
      { mistake: "Connecting 5 V sensor outputs directly to ESP32 pins.", why: "ESP32 GPIOs are 3.3 V devices and are not designed for 5 V inputs.", fix: "Use a voltage divider or level shifter, or power the sensor at 3.3 V if it supports it." },
      { mistake: "Assuming int behaves the same on every board.", why: "int is 16-bit on the Uno but 32-bit on the ESP32, so overflow happens on one and not the other.", fix: "Use explicit types like int16_t, int32_t or long when the size matters." },
      { mistake: "Filling SRAM with large arrays and String objects.", why: "The ATmega328P has only 2 KB of SRAM; running out causes random crashes.", fix: "Use F(\"text\") for constant strings in Serial.print and keep arrays small." },
      { mistake: "Forgetting pinMode(pin, OUTPUT) before digitalWrite.", why: "Writing HIGH to an input pin only enables the weak internal pull-up, so the output is very weak.", fix: "Configure every output pin in setup()." },
    ],
    keyTakeaways: [
      "A microcontroller combines CPU, flash, SRAM, EEPROM and peripherals in one chip.",
      "The Uno's ATmega328P: 8-bit, 16 MHz, 32 KB flash, 2 KB SRAM, 5 V logic.",
      "The ESP32 is faster with Wi-Fi/Bluetooth but uses 3.3 V logic.",
      "setup() runs once; loop() runs forever — keep it fast.",
      "Hardware timers create PWM and millis() independently of your code.",
    ],
    relatedComponents: ["Arduino Uno R3", "Arduino Nano", "ESP32 DevKit V1"],
    youtubeSearch: "what is a microcontroller ATmega328P vs ESP32 explained",
    quiz: [
      {
        type: "mcq",
        prompt: "What is the most important electrical difference to remember when moving a robot design from an Arduino Uno to an ESP32?",
        options: ["The ESP32 cannot run C++ code", "The ESP32 has no PWM", "The ESP32 has no analog inputs", "The ESP32 uses 3.3 V logic, so 5 V signals must be level-shifted"],
        answerIndex: 3,
        explanation: "ESP32 GPIOs work at 3.3 V and are not designed for 5 V inputs, so 5 V sensor outputs need dividers or level shifters. The ESP32 does have PWM and analog inputs (a 12-bit ADC) and is programmed in C++ with the Arduino core.",
        difficulty: 1,
      },
      {
        type: "identify-driver",
        prompt: "A tiny robot uses an ESP32 and two N20 motors powered from a single 3.7 V Li-ion cell. Which motor driver suits this best?",
        options: ["L298N", "DRV8833", "A single BC547 transistor", "A 5 V relay module"],
        answerIndex: 1,
        explanation: "The DRV8833 is a MOSFET dual H-bridge that runs from about 2.7–10.8 V and accepts 3.3 V logic, so it fits a single cell. The L298N drops around 2 V internally, leaving very little of 3.7 V for the motors. A single transistor cannot reverse the motors and a relay cannot do PWM.",
        difficulty: 2,
      },
      {
        type: "code-output",
        prompt: "What does this sketch print?",
        code: `void setup() {
  Serial.begin(9600);
  byte b = 250;
  b = b + 10;
  Serial.println(b);
}

void loop() {}`,
        options: ["260", "255", "4", "-6"],
        answerIndex: 2,
        explanation: "A byte is 8-bit unsigned (0–255). 250 + 10 = 260, which wraps around modulo 256 to 4. It does not saturate at 255, and it cannot be negative because byte is unsigned.",
        difficulty: 2,
      },
      {
        type: "debug-code",
        prompt: "An LED with a 220 Ω resistor is wired from pin 12 to GND, but it only glows very faintly. What is the bug?",
        code: `void setup() {
  // nothing here
}

void loop() {
  digitalWrite(12, HIGH);
}`,
        options: ["pinMode(12, OUTPUT) is missing, so HIGH only enables the weak internal pull-up", "digitalWrite needs a delay() after it", "Pin 12 cannot drive LEDs; only PWM pins can", "HIGH should be written as 1"],
        answerIndex: 0,
        explanation: "Pins start as inputs. digitalWrite(HIGH) on an input enables the internal pull-up (tens of kΩ), which leaks only a tiny current into the LED. Adding pinMode(12, OUTPUT) in setup() fixes it. Any digital pin can drive an LED; HIGH and 1 are equivalent.",
        difficulty: 2,
      },
    ],
  }),

  defineTopic("line", 11, {
    slug: "arduino-uno",
    title: "Arduino Uno",
    minutes: 12,
    summary: "The Arduino Uno R3 gives you an ATmega328P with 14 digital pins (6 PWM), 6 analog inputs, USB programming and on-board power regulation.",
    introduction: `The Arduino Uno R3 is the default brain for club robots. Knowing its pins, power options and limits by heart lets you wire a robot quickly and avoid the classic mistakes: using a non-PWM pin for motor speed, putting a sensor on the Serial pins, or overloading the 5 V regulator.

This topic is a guided tour of the board.`,
    beginner: `Think of the Arduino Uno as a ready-made control panel built around the ATmega328P chip. Instead of soldering wires to tiny chip legs, you plug jumper wires into labelled sockets along the edges of the board.

Along the top edge are the digital pins, numbered 0 to 13. Each one can be switched on (5 V) or off (0 V), or read as on/off. Some of them have a little wavy line (~) printed next to the number: 3, 5, 6, 9, 10 and 11. Those can also produce PWM, the fast on-off signal used to control motor speed.

Along the bottom edge are the analog inputs A0 to A5, which can measure voltages between 0 and 5 V — perfect for analog line sensors and battery monitoring. Next to them are the power pins: 5V, 3.3V, GND and Vin.

The USB socket lets you upload programs and talk to your computer through the Serial Monitor; it can also power the board. The round barrel jack lets you plug in a battery or adapter, and an on-board regulator turns that into a clean 5 V.

The Uno is forgiving, cheap and extremely well documented, which is why almost every beginner robot starts with one.`,
    technical: [
      {
        heading: "Key specifications",
        body: `- Microcontroller: ATmega328P at 16 MHz.
- Operating voltage: 5 V. Recommended input (barrel jack / Vin): 7–12 V.
- Digital I/O: 14 pins (D0–D13), of which 6 provide PWM: 3, 5, 6, 9, 10, 11.
- PWM frequency: about 490 Hz on pins 3, 9, 10, 11 and about 980 Hz on pins 5 and 6.
- Analog inputs: 6 (A0–A5), 10-bit (0–1023). A0–A5 can also be used as digital pins.
- DC current per I/O pin: 40 mA absolute maximum, 20 mA recommended. The chip also has a total current limit, so the sum of all pins matters too.
- Flash 32 KB (0.5 KB bootloader), SRAM 2 KB, EEPROM 1 KB.`,
      },
      {
        heading: "Pins with special jobs",
        body: `- D0 (RX) and D1 (TX): hardware Serial, shared with the USB connection. Devices on these pins can block uploads and corrupt Serial Monitor output.
- D2 and D3: external interrupts (attachInterrupt) — ideal for wheel encoders.
- D10 (SS), D11 (MOSI), D12 (MISO), D13 (SCK): SPI bus. D13 also drives the on-board 'L' LED.
- A4 (SDA) and A5 (SCL): I2C bus, also duplicated on the header near AREF on R3 boards.
- AREF: external reference for the ADC (advanced use).`,
      },
      {
        heading: "Powering the Uno on a robot",
        body: `- USB: 5 V from the computer — for programming and bench tests.
- Barrel jack or Vin: 7–12 V recommended into the on-board linear regulator. A 2S Li-ion pack (7.4 V nominal, 8.4 V full) works, but if motor current makes the pack sag below about 7 V the 5 V rail can droop and the board may reset.
- 5V pin: you can feed a regulated 5 V directly (e.g. from a buck converter), bypassing the regulator — never feed more than 5 V here.

The linear regulator turns excess voltage into heat: (V_in − 5) × I. At 9 V in and 200 mA out that is 0.8 W — warm. Do not power motors or servos from the Uno's 5V pin.`,
      },
    ],
    workingPrinciple: `The Uno is a carrier board for the ATmega328P: it adds a 16 MHz crystal for timing, a USB-to-serial chip (an ATmega16U2 on the R3) for uploading and Serial communication, a voltage regulator for flexible power input, a reset button, and headers that expose the microcontroller's port pins with friendly numbers. The Arduino core library maps those friendly numbers onto the chip's port registers, so digitalWrite(13, HIGH) sets bit 5 of port B.`,
    diagrams: [
      { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["D3", "D5", "D6", "D9", "D10", "D11"] },
      { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["A0", "A1", "A2", "A3", "A4", "A5", "5V", "GND1", "VIN"] },
    ],
    examples: [
      {
        title: "Planning pins for a 5-sensor line follower",
        body: "- Sensors (analog): A0–A4.\n- L298N: ENA → D5 (PWM), ENB → D6 (PWM), IN1 → D7, IN2 → D8, IN3 → D4, IN4 → D12. Direction pins use plain digital pins so the remaining PWM pins (3, 9, 10, 11) stay free.\n- Start button: D2 (interrupt-capable, INPUT_PULLUP).\n- Status LED: D13.\n- D0/D1 left free for Serial debugging.\n\nUsing D5 and D6 for ENA/ENB gives both motors the same ~980 Hz PWM frequency.",
      },
      {
        title: "Board self-test sketch",
        body: "Blink the on-board LED and print all analog inputs, a quick check that the board, USB and ADC work before wiring the robot.",
        code: `void setup() {
  pinMode(LED_BUILTIN, OUTPUT); // pin 13 on the Uno
  Serial.begin(9600);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(250);
  digitalWrite(LED_BUILTIN, LOW);
  delay(250);
  for (int ch = 0; ch < 6; ch++) {
    Serial.print(analogRead(A0 + ch));
    Serial.print(" ");
  }
  Serial.println();
}`,
      },
    ],
    commonMistakes: [
      { mistake: "Using a non-PWM pin (e.g. D7) for motor speed.", why: "analogWrite on a non-PWM pin only gives fully on (value ≥ 128) or fully off.", fix: "Use pins 3, 5, 6, 9, 10 or 11 for ENA/ENB or PWM inputs." },
      { mistake: "Connecting sensors to D0/D1.", why: "They are shared with USB Serial; uploads may fail and readings get mixed with Serial data.", fix: "Keep D0 and D1 free unless you really need them." },
      { mistake: "Powering motors from the Uno's 5V pin.", why: "Motor current overloads the regulator and USB supply and injects noise, causing resets.", fix: "Power motors from the battery through a motor driver." },
      { mistake: "Feeding 7.4 V into the 5V pin.", why: "The 5V pin bypasses the regulator; over-voltage can destroy the board.", fix: "Feed battery voltage into Vin or the barrel jack; feed only regulated 5 V into the 5V pin." },
    ],
    keyTakeaways: [
      "PWM pins on the Uno: 3, 5, 6, 9, 10, 11 (~490 Hz; 5 and 6 at ~980 Hz).",
      "A0–A5 read 0–5 V as 0–1023; A4/A5 double as I2C.",
      "D0/D1 are Serial; D2/D3 are external interrupts.",
      "Per-pin current: 20 mA recommended, 40 mA absolute max.",
      "Vin/barrel jack: 7–12 V recommended; the 5V pin needs regulated 5 V only.",
    ],
    relatedComponents: ["Arduino Uno R3", "Arduino Nano", "L298N"],
    youtubeSearch: "arduino uno r3 pinout explained PWM analog pins power",
    quiz: [
      {
        type: "identify-pin",
        prompt: "You need to control motor speed with analogWrite. Which of these Arduino Uno pins can NOT produce hardware PWM?",
        options: ["D3", "D5", "D7", "D9"],
        answerIndex: 2,
        explanation: "The Uno's PWM pins are 3, 5, 6, 9, 10 and 11 (marked ~). D7 is a plain digital pin: analogWrite there just switches fully on or off. D3, D5 and D9 are all PWM-capable.",
        difficulty: 1,
        diagram: { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["D3", "D5", "D7", "D9"] },
      },
      {
        type: "identify-pin",
        prompt: "An I2C distance sensor has SDA and SCL wires. Which Uno pins should they connect to?",
        options: ["D0 (SDA) and D1 (SCL)", "A4 (SDA) and A5 (SCL)", "D11 (SDA) and D13 (SCL)", "D2 (SDA) and D3 (SCL)"],
        answerIndex: 1,
        explanation: "On the Uno, I2C is on A4 (SDA) and A5 (SCL), also duplicated on the header near AREF on R3 boards. D11/D13 are SPI (MOSI/SCK), and D0/D1 are the Serial pins.",
        difficulty: 2,
        diagram: { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["A4", "A5"] },
      },
      {
        type: "identify-driver",
        prompt: "A motor driver module has a large black heatsink, a 3-way screw terminal labelled 12V / GND / 5V, a jumper next to it, two 2-way motor terminals and header pins ENA, IN1, IN2, IN3, IN4, ENB. Which driver is it?",
        options: ["DRV8833", "TB6612FNG", "A single MOSFET module", "L298N"],
        answerIndex: 3,
        explanation: "This is the classic L298N module: the heatsink is needed because its bipolar H-bridges waste power, and the jumper enables its on-board 5 V regulator. The TB6612FNG and DRV8833 are small MOSFET boards without heatsinks or ENA/ENB headers.",
        difficulty: 1,
      },
      {
        type: "mcq",
        prompt: "What is the recommended input voltage range for the Arduino Uno's barrel jack / Vin pin?",
        options: ["3.3–5 V", "7–12 V", "12–24 V", "Exactly 5 V"],
        answerIndex: 1,
        explanation: "The Uno's regulator needs some headroom above 5 V, so 7–12 V is recommended. Exactly 5 V is what you would feed into the 5V pin (bypassing the regulator), not into Vin.",
        difficulty: 1,
      },
    ],
  }),

  defineTopic("line", 12, {
    slug: "gpio",
    title: "GPIO",
    minutes: 11,
    summary: "General-purpose input/output pins can be configured as outputs that drive HIGH or LOW, or as inputs that read logic levels — with or without the internal pull-up.",
    introduction: `GPIO pins are the robot's simplest connection to the outside world. As outputs they set motor directions, light LEDs and trigger ultrasonic sensors. As inputs they read buttons, bumper switches and digital IR sensor modules.

This topic covers pin modes, logic thresholds, current limits, pull-ups and the bugs that trip up almost every beginner.`,
    beginner: `Imagine a row of light switches and doorbells along a wall. Each spot on the wall can be set up either as a switch you control (an output) or as a doorbell that tells you when someone outside presses it (an input). You decide which job each spot has before you start.

An Arduino digital pin is the same. In setup() you call pinMode() to choose: OUTPUT if the Arduino will control something, INPUT (or INPUT_PULLUP) if it will listen. An output pin can be set HIGH, which means about 5 V, or LOW, which means 0 V. An input pin reports HIGH if the voltage on it is high enough, and LOW if it is low enough.

There is one important limit: an output pin can only supply a little current — enough for an LED or a signal wire, but not for a motor. That is why motor drivers exist.

And an input pin that is not connected to anything is like a doorbell wire dangling in the wind: it picks up electrical noise and randomly reports HIGH or LOW. The cure is a pull-up resistor that gently holds it HIGH until a button pulls it LOW. The Arduino has one built in that you switch on with INPUT_PULLUP.`,
    technical: [
      {
        heading: "Modes and functions",
        body: `- pinMode(pin, OUTPUT): the pin actively drives HIGH (≈ VCC) or LOW (≈ 0 V) via digitalWrite.
- pinMode(pin, INPUT): high-impedance input; digitalRead returns HIGH or LOW.
- pinMode(pin, INPUT_PULLUP): input with an internal pull-up (roughly 20–50 kΩ) to VCC.

Logic thresholds for the ATmega328P at 5 V (datasheet): an input is guaranteed LOW below 0.3 × VCC = 1.5 V and guaranteed HIGH above 0.6 × VCC = 3.0 V. Between those, the result is undefined — avoid slowly-changing or mid-level signals on digital inputs (use analogRead or a comparator instead).`,
      },
      {
        heading: "Electrical limits",
        body: `- Per pin: 40 mA absolute maximum, about 20 mA recommended for long-term reliability.
- The output voltage sags as current increases, because each pin driver has internal resistance — a pin sourcing 20 mA no longer sits at exactly 5 V.
- The chip also has a limit on total current through its VCC and GND pins, so ten LEDs at 20 mA each is a bad idea.
- Never connect an OUTPUT pin set HIGH directly to GND (or set LOW directly to 5 V) — that is a short circuit through the pin driver.`,
      },
      {
        heading: "Ports and speed",
        body: `Uno pins map to three 8-bit ports: PORTD = D0–D7, PORTB = D8–D13, PORTC = A0–A5. digitalWrite() is convenient but takes a few microseconds because it looks up the port and checks for PWM. Direct register writes such as PORTB |= (1 << 5) (sets D13) take a single instruction. For line following, digitalWrite/digitalRead are fast enough; register access matters only for very tight timing.`,
      },
      {
        heading: "Debouncing inputs",
        body: `Mechanical buttons and bumper switches 'bounce': the contacts make and break several times over a few milliseconds. Code that counts presses may see many presses for one physical push. Fix it in software by ignoring changes for ~20–50 ms after the first edge, or in hardware with an RC filter.`,
      },
    ],
    workingPrinciple: `Each GPIO pin is connected inside the chip to a data-direction register bit, an output register bit and an input buffer. When the direction bit is 'output', a pair of transistors connects the pin to VCC (HIGH) or GND (LOW) according to the output bit. When the direction bit is 'input', those transistors are off, the pin is high-impedance, and a Schmitt-trigger buffer converts the pin voltage into a 0 or 1. Writing 1 to the output bit while in input mode switches on the internal pull-up resistor.`,
    diagrams: [
      { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["D0", "D1", "D2", "D3", "D13"] },
      {
        kind: "circuit",
        nodes: [
          { id: "vcc", label: "VCC (5 V)", x: 260, y: 20 },
          { id: "rpu", label: "Internal pull-up ~20–50 kΩ", x: 260, y: 100 },
          { id: "pin", label: "Pin D4 (INPUT_PULLUP)", x: 260, y: 180 },
          { id: "btn", label: "Button", x: 460, y: 180 },
          { id: "gnd", label: "GND", x: 460, y: 280 },
        ],
        edges: [
          { from: "vcc", to: "rpu" },
          { from: "rpu", to: "pin" },
          { from: "pin", to: "btn" },
          { from: "btn", to: "gnd", label: "pressed → LOW" },
        ],
      },
    ],
    examples: [
      {
        title: "Bumper switch with debounce",
        body: "A microswitch between D2 and GND. The code counts real presses only, ignoring bounces shorter than 30 ms.",
        code: `const int BUMPER = 2;
int lastState = HIGH;
unsigned long lastChange = 0;
int hits = 0;

void setup() {
  pinMode(BUMPER, INPUT_PULLUP);
  Serial.begin(9600);
}

void loop() {
  int state = digitalRead(BUMPER);
  if (state != lastState && millis() - lastChange > 30) {
    lastChange = millis();
    lastState = state;
    if (state == LOW) {        // pressed (pull-up logic)
      hits++;
      Serial.println(hits);
    }
  }
}`,
      },
      {
        title: "Setting motor direction pins",
        body: "Direction pins on a motor driver are plain GPIO outputs. Here IN1/IN2 control one motor of an L298N or TB6612FNG.",
        code: `const int IN1 = 7;
const int IN2 = 8;

void forward()  { digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW); }
void backward() { digitalWrite(IN1, LOW);  digitalWrite(IN2, HIGH); }
void coast()    { digitalWrite(IN1, LOW);  digitalWrite(IN2, LOW); }

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
}

void loop() {
  forward();  delay(1000);
  coast();    delay(500);
  backward(); delay(1000);
  coast();    delay(500);
}`,
      },
    ],
    commonMistakes: [
      { mistake: "Writing if (x = HIGH) instead of if (x == HIGH).", why: "A single = assigns HIGH to x, and the condition is always true.", fix: "Use == for comparison; enable compiler warnings in the IDE preferences." },
      { mistake: "Leaving inputs floating.", why: "An unconnected input picks up noise and reads random values.", fix: "Use INPUT_PULLUP or an external pull-up/pull-down resistor." },
      { mistake: "Forgetting that INPUT_PULLUP inverts button logic.", why: "Pressed = LOW, released = HIGH, so code checking for HIGH triggers on release.", fix: "Check for LOW when using pull-ups, or name a helper function isPressed()." },
      { mistake: "Driving loads above 20 mA from a pin.", why: "Exceeding pin current ratings damages the chip over time or instantly.", fix: "Use a transistor or motor driver for anything bigger than an LED or signal." },
    ],
    keyTakeaways: [
      "Set every pin's role with pinMode(): OUTPUT, INPUT or INPUT_PULLUP.",
      "At 5 V, inputs read LOW below 1.5 V and HIGH above 3.0 V; in between is undefined.",
      "Keep pin current at or below 20 mA (40 mA absolute max).",
      "Floating inputs read garbage — always pull them up or down.",
      "Debounce mechanical switches in software or hardware.",
    ],
    relatedComponents: ["Arduino Uno R3", "Push Button Switch", "Micro Switch", "LED Diode"],
    youtubeSearch: "arduino digital pins pinMode INPUT_PULLUP explained",
    quiz: [
      {
        type: "identify-pin",
        prompt: "Your robot works when powered from a battery, but uploading new code fails and the Serial Monitor shows garbage while a sensor is connected. Which pins is the sensor most likely connected to?",
        options: ["D2 and D3", "A0 and A1", "D12 and D13", "D0 and D1"],
        answerIndex: 3,
        explanation: "D0 (RX) and D1 (TX) are shared with the USB-serial connection; anything driving them interferes with uploads and Serial output. D2 and D3 are free general pins (and interrupt-capable).",
        difficulty: 1,
        diagram: { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["D0", "D1"] },
      },
      {
        type: "debug-code",
        prompt: "The LED on pin 13 is ALWAYS on, whether or not the sensor on pin 2 sees the line. What is the bug?",
        code: `void setup() {
  pinMode(2, INPUT);
  pinMode(13, OUTPUT);
}

void loop() {
  int sensor = digitalRead(2);
  if (sensor = HIGH) {
    digitalWrite(13, HIGH);
  } else {
    digitalWrite(13, LOW);
  }
}`,
        options: ["pinMode(2, INPUT) should be OUTPUT", "if (sensor = HIGH) assigns instead of compares; it should be ==", "digitalRead returns a float", "The LED must be on a PWM pin"],
        answerIndex: 1,
        explanation: "sensor = HIGH assigns 1 to sensor, and the expression's value (1) is true every time, so the LED is always on. Using == compares correctly. Changing pin 2 to OUTPUT would stop it reading the sensor at all.",
        difficulty: 2,
      },
      {
        type: "code-output",
        prompt: "What does this sketch print?",
        code: `void setup() {
  Serial.begin(9600);
  int state = LOW;
  for (int i = 0; i < 3; i++) {
    state = !state;
  }
  Serial.println(state);
}

void loop() {}`,
        options: ["0", "1", "3", "HIGH"],
        answerIndex: 1,
        explanation: "LOW is 0. Toggling three times: 0 → 1 → 0 → 1, so it prints 1. Serial.println prints the number, not the word HIGH; and the loop toggles the value, it does not count, so 3 is wrong.",
        difficulty: 1,
      },
      {
        type: "find-wrong-connection",
        prompt: "A start button is wired between pin 3 and GND. The code has pinMode(3, OUTPUT) and digitalWrite(3, HIGH) in setup(), then reads the pin in loop(). When the button is pressed, the board resets or the pin gets hot. What is wrong?",
        options: ["The button should go to 5 V instead of GND", "Pin 3 must be an analog pin", "Pin 3 is configured as an OUTPUT driving HIGH, so pressing the button shorts it to GND; it should be INPUT_PULLUP", "A capacitor is missing in series with the button"],
        answerIndex: 2,
        explanation: "An output driving HIGH connected straight to GND through the button is a short circuit through the pin driver. Configure the pin as INPUT_PULLUP and read LOW when pressed. Moving the button to 5 V would just make the short invisible until the pin is driven LOW.",
        difficulty: 2,
      },
    ],
  }),
];
