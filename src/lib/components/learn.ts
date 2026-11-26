/**
 * Learning-mode content: a short, beginner-friendly explanation of each component.
 * Hand-written lessons for the parts students meet first (L298N, TB6612FNG, Arduino, DC motor, 18650 packs,
 * IR line sensor, ultrasonic, LED, resistor, switch, buck converter); every other part gets a lesson built
 * from its catalogue record (description, pins with their notes and voltage ranges), so no part is left blank.
 */
import type { ComponentRecord } from "@/lib/types";
import { supportOf } from "./support";

export interface Lesson {
  title: string;
  intro: string;
  how: string;
  pins: { pin: string; text: string }[];
  connect: string[];
  mistakes: string[];
  uses: string[];
  /** quick questions with short answers */
  qa: { q: string; a: string }[];
  /** what the simulator does with it */
  sim: string;
}

type Hand = Omit<Lesson, "pins" | "sim"> & { pins?: { pin: string; text: string }[] };

const L298N: Hand = {
  title: "What is an L298N?",
  intro: "A motor driver board with two H-bridges. It lets a small Arduino pin control a big motor current, in both directions.",
  how: "An Arduino pin can give about 20 mA — a motor needs hundreds of mA. The L298N switches the battery's power to the motor. Each H-bridge is four switches around the motor: closing opposite pairs pushes current one way or the other, so the motor turns forwards or backwards.",
  pins: [
    { pin: "+12V (VS)", text: "Motor battery in (5–35 V; ≤12 V with the 5V jumper fitted)." },
    { pin: "GND", text: "Ground — connect to battery − AND to the Arduino GND." },
    { pin: "+5V", text: "5 V out from the on-board regulator (jumper fitted) — or 5 V in when the jumper is removed." },
    { pin: "ENA / ENB", text: "Enable = speed for motor A / B. PWM here sets the speed." },
    { pin: "IN1, IN2", text: "Direction of motor A." },
    { pin: "IN3, IN4", text: "Direction of motor B." },
    { pin: "OUT1, OUT2", text: "Motor A terminals." },
    { pin: "OUT3, OUT4", text: "Motor B terminals." },
  ],
  connect: ["Battery + → +12V, battery − → GND.", "L298N GND → Arduino GND (common ground!).", "ENA → a PWM pin (~5), IN1 → 7, IN2 → 8.", "ENB → a PWM pin (~6), IN3 → 9, IN4 → 10.", "Motor A → OUT1/OUT2, motor B → OUT3/OUT4."],
  mistakes: ["Forgetting the common ground between the L298N and the Arduino.", "Leaving the ENA/ENB jumpers on and wiring PWM to them as well.", "Putting ENA on a pin without PWM (e.g. D4) — no speed control.", "Using a 1-cell (3.7 V) battery: the L298N loses about 2 V."],
  uses: ["2WD and 4WD robot cars", "Line followers", "Conveyor and fan control"],
  qa: [
    { q: "Why are there two H-bridges?", a: "One per motor: channel A (OUT1/OUT2) and channel B (OUT3/OUT4) work independently, so the left and right wheels can turn at different speeds and directions." },
    { q: "What happens when IN1 is HIGH and IN2 is LOW?", a: "Motor A turns one way (forwards). IN1 LOW + IN2 HIGH turns it the other way; both the same = brake." },
    { q: "Why is PWM connected to ENA?", a: "PWM switches ENA on and off very fast. The longer it is on (the duty cycle), the more average voltage the motor gets — so analogWrite(ENA, 128) ≈ half speed." },
    { q: "Why does my motor get less than the battery voltage?", a: "The L298N's transistors drop about 2 V. On a 7.4 V pack the motor sees ≈5.4 V. MOSFET drivers (TB6612FNG) lose only ≈0.5 V." },
  ],
};

const TB6612: Hand = {
  title: "What is a TB6612FNG?",
  intro: "A small dual motor driver built from MOSFETs. It does the same job as an L298N but wastes much less battery voltage.",
  how: "Like the L298N it has two H-bridges. MOSFET switches have very low resistance, so only about 0.5 V is lost instead of ≈2 V. It needs a separate logic supply (VCC) and the STBY pin must be HIGH.",
  connect: ["VM → battery + (4.5–13.5 V), GND → battery − and Arduino GND.", "VCC → Arduino 5V.", "STBY → 5V (or a pin set HIGH).", "PWMA → PWM pin, AIN1/AIN2 → digital pins; same for B."],
  mistakes: ["Forgetting STBY — the driver stays asleep.", "No VCC logic supply.", "More than 13.5 V on VM."],
  uses: ["Small fast robots", "Mini-sumo", "Line followers"],
  qa: [{ q: "Why choose it over an L298N?", a: "Less voltage loss (faster motors, longer battery life), much less heat, smaller — but a lower current rating (1.2 A per channel)." }],
};

const ARDUINO: Hand = {
  title: "What is an Arduino?",
  intro: "A small computer (microcontroller) that runs your code and controls the robot through its pins.",
  how: "Each digital pin can be an OUTPUT (HIGH = 5 V, LOW = 0 V) or an INPUT (read a sensor). Pins with ~ can make PWM (analogWrite) and A0–A5 can measure voltages (analogRead).",
  pins: [
    { pin: "VIN", text: "Battery in (7–12 V recommended) through the on-board regulator." },
    { pin: "5V / 3.3V", text: "Regulated supplies for small sensors and driver logic." },
    { pin: "GND", text: "Ground — must be shared with every module." },
    { pin: "D2–D13", text: "Digital pins; ~3, 5, 6, 9, 10, 11 also do PWM; 2 and 3 do interrupts." },
    { pin: "A0–A5", text: "Analog inputs (0–1023); A4/A5 are also I²C SDA/SCL." },
  ],
  connect: ["Battery + (through the switch) → VIN, battery − → GND.", "Every module's GND → an Arduino GND."],
  mistakes: ["Powering motors from a pin.", "Using D0/D1 (they are the USB serial port).", "No common ground with the motor driver."],
  uses: ["The brain of every BEAST robot"],
  qa: [{ q: "Why can't a pin drive a motor directly?", a: "A pin supplies ≈20 mA; even a small gear motor needs hundreds of mA. It would damage the pin — that is what a motor driver is for." }],
};

const MOTOR: Hand = {
  title: "What is a DC gear motor?",
  intro: "A motor that turns when voltage is applied across its two terminals. A gearbox trades speed for pushing power (torque).",
  how: "More voltage → faster. Swap the polarity → it turns the other way. When it is blocked (stalled) it draws its maximum 'stall current' — that is the number your driver and battery must handle.",
  connect: ["Both terminals to one motor-driver channel (e.g. OUT1 and OUT2).", "If a wheel turns backwards, swap its two wires (or swap in code)."],
  mistakes: ["Wiring a motor straight to an Arduino pin.", "One terminal on channel A and the other on channel B.", "Over-volting a 6 V motor with a 3S (12.6 V) pack."],
  uses: ["Wheels", "Weapons and lifters", "Conveyors"],
  qa: [{ q: "What does stall current mean?", a: "The current when the motor is stopped but powered (starting, pushing a sumo opponent). It can be 5–10× the running current." }],
};

const PACK: Hand = {
  title: "18650 battery packs: series and parallel",
  intro: "An 18650 is a rechargeable lithium-ion cell (18 mm × 65 mm). Robots combine several cells into a pack.",
  how: "SERIES (S) adds voltages: 2S = 2 × 3.6 V = 7.2 V. PARALLEL (P) adds capacity and current: 1S2P = 3.6 V with twice the mAh. 4 cells can be 4S1P (14.4 V) or 2S2P (7.2 V, double capacity). A full cell is 4.2 V, so a 2S pack starts at 8.4 V.",
  connect: ["Pack + → (switch, optional) → motor driver supply and controller VIN.", "Pack − → ground of every module."],
  mistakes: ["Mixing old and new cells.", "No BMS on a multi-cell pack.", "Shorting + and −: a Li-ion cell can deliver tens of amps."],
  uses: ["2S (7.2–8.4 V) for most 2WD robots", "3S–4S for faster robots with 12 V motors"],
  qa: [
    { q: "Do I need a switch?", a: "Not for the simulator — the battery works as soon as the circuit is complete. A real robot should have one to cut power quickly." },
    { q: "Why a BMS?", a: "It stops over-charge, over-discharge and short circuits and keeps series cells balanced. Lithium cells without one can catch fire." },
    { q: "How long will it last?", a: "Roughly capacity (Ah) ÷ current (A). 2.5 Ah at 1.5 A ≈ 1.7 h of driving — less at high load." },
  ],
};

const IR_LINE: Hand = {
  title: "What is an IR line sensor?",
  intro: "It shines invisible infrared light at the floor and measures how much bounces back: white reflects a lot, a black line very little.",
  how: "The output changes with reflection: digital modules give HIGH/LOW (a pot sets the threshold), analog ones give a voltage you read with analogRead().",
  connect: ["VCC → 5V, GND → GND.", "OUT/D0 → a digital pin (or A0–A5 for analog)."],
  mistakes: ["Mounting it too high above the floor (keep 3–10 mm).", "Analog output on a digital-only pin."],
  uses: ["Line followers", "Sumo ring-edge detection"],
  qa: [{ q: "Why does black read differently?", a: "Black absorbs infrared, so little light returns — the sensor output flips." }],
};

const ULTRASONIC: Hand = {
  title: "What is an ultrasonic sensor (HC-SR04)?",
  intro: "It measures distance with sound you cannot hear, like a bat.",
  how: "A 10 µs pulse on TRIG sends a ping; ECHO stays HIGH until the echo returns. Distance = time × speed of sound ÷ 2.",
  connect: ["VCC → 5V, GND → GND.", "TRIG → a digital output, ECHO → a digital input."],
  mistakes: ["TRIG not connected — it never measures.", "Soft or angled targets absorb the sound."],
  uses: ["Sumo opponent detection", "Obstacle avoidance"],
  qa: [{ q: "How far can it see?", a: "About 2 cm to 4 m on a flat target." }],
};

const LED: Hand = {
  title: "What is an LED?",
  intro: "A light-emitting diode: it lights when current flows from the anode (+, long leg) to the cathode (−).",
  how: "Above its forward voltage (≈2 V red, ≈3 V blue) the current rises very fast, so a resistor must limit it: R = (V supply − V LED) ÷ current. 20 mA is full brightness.",
  connect: ["Pin or supply → resistor (e.g. 220 Ω) → LED anode; LED cathode → GND."],
  mistakes: ["No resistor — the LED burns out.", "LED in backwards — it never lights."],
  uses: ["Status lights", "Debug indicators"],
  qa: [{ q: "Which resistor for 5 V and a red LED?", a: "(5 − 2) ÷ 0.015 A = 200 Ω → use 220 Ω." }],
};

const RESISTOR: Hand = {
  title: "What is a resistor?",
  intro: "It limits current. Ohm's law: current = voltage ÷ resistance.",
  how: "Higher resistance → less current. It turns the energy into heat: power = current² × resistance (a small resistor handles ¼ W).",
  connect: ["In series with an LED, as a pull-up/pull-down on an input, or as a voltage divider."],
  mistakes: ["Too small a value — too much current and heat.", "Using it to drop a motor's voltage (wastes power)."],
  uses: ["LED current limiting", "Pull-up resistors", "Voltage dividers for 3.3 V logic"],
  qa: [{ q: "How do I read the colour bands?", a: "First two bands = digits, third = number of zeros: red-red-brown = 22 × 10 = 220 Ω." }],
};

const SWITCH: Hand = {
  title: "What is a switch?",
  intro: "It opens or closes a connection. Closed = current can flow; open = the circuit is broken.",
  how: "A toggle stays where you put it (power switch); a push button only closes while pressed (inputs).",
  connect: ["Power switch: in series with battery +.", "Button input: between a pin and GND, with pinMode(pin, INPUT_PULLUP)."],
  mistakes: ["Button input with no pull-up/down resistor — the pin floats and reads random values."],
  uses: ["Power / emergency stop", "Start buttons", "Bumpers"],
  qa: [{ q: "Is a power switch required?", a: "Not in the simulator. Competition rules usually require one on a real robot." }],
};

const BUCK: Hand = {
  title: "What is a buck converter?",
  intro: "A step-down power module: it turns a higher battery voltage into a lower one (e.g. 11.1 V → 5 V) efficiently.",
  how: "It switches very fast and smooths the result, so it wastes much less energy than a linear regulator. Turn the small screw to set the output.",
  connect: ["IN+ / IN− from the battery, OUT+ / OUT− to the 5 V loads (servos, Raspberry Pi …)."],
  mistakes: ["Not setting the output voltage before connecting loads.", "Swapping IN and OUT."],
  uses: ["5 V for servos and sensors from a 3S pack"],
  qa: [{ q: "Why not use the Arduino 5V pin?", a: "Its regulator can only give a few hundred mA; servos need amps." }],
};

function handFor(c: ComponentRecord): Hand | null {
  if (c.id === "l298n" || (c.tags.includes("custom") && c.driver?.scheme === "in-in-en")) return L298N;
  if (c.id === "tb6612fng") return TB6612;
  if (c.kind === "controller" && /arduino|nano|uno|mega/i.test(c.name)) return ARDUINO;
  if (c.kind === "dc-motor") return MOTOR;
  if (c.battery && /18650|li-ion/i.test(c.name)) return PACK;
  if (c.sensor?.kind?.startsWith("reflectance")) return IR_LINE;
  if (c.sensor?.kind === "ultrasonic") return ULTRASONIC;
  if (c.kind === "led" && c.pins.some((p) => p.fn === "anode")) return LED;
  if (c.kind === "resistor") return RESISTOR;
  if (c.kind === "switch") return SWITCH;
  if (c.kind === "regulator" && /buck|lm2596|xl40/i.test(c.name)) return BUCK;
  return null;
}

function pinText(c: ComponentRecord) {
  return c.pins.slice(0, 16).map((p) => {
    const bits: string[] = [];
    if (p.vRange) bits.push(`${p.vRange[0]}–${p.vRange[1]} V in`);
    if (p.vOut !== undefined) bits.push(`${p.vOut} V out`);
    if (p.note) bits.push(p.note);
    const fn: Record<string, string> = { gnd: "Ground", vin: "Power input", vout: "Power output", "bat+": "Battery +", "bat-": "Battery −", "motor-out": "Motor output", "motor-term": "Motor terminal", "in-digital": "Digital input", "in-pwm": "PWM input", "in-analog": "Analog input", "out-digital": "Digital output", "out-analog": "Analog output", gpio: "Controller pin" };
    return { pin: p.label, text: [fn[p.fn] ?? p.fn, ...bits].join(" — ") };
  });
}

export function lessonFor(c: ComponentRecord): Lesson {
  const sim = supportOf(c);
  const simText = `${sim.label}: ${sim.model}${sim.limits.length ? ` Not modelled: ${sim.limits.join(" ")}` : ""}`;
  const h = handFor(c);
  if (h) return { ...h, pins: h.pins ?? pinText(c), sim: simText };
  const first = c.description.split(/(?<=\.)\s/)[0] ?? c.description;
  return {
    title: `What is a ${c.name}?`,
    intro: first,
    how: c.description.slice(first.length).trim() || "See the pins below for how it connects.",
    pins: pinText(c),
    connect: c.pins.some((p) => p.fn === "gnd") ? ["Connect GND to the system ground shared with your controller.", ...(c.pins.some((p) => p.fn === "vin") ? ["Feed each power input with a voltage inside its range (shown above)."] : [])] : [],
    mistakes: c.pins.some((p) => p.fn === "vin") ? ["Supplying more than the maximum voltage.", "Forgetting the common ground."] : [],
    uses: c.competitions ? (Object.entries(c.competitions).filter(([, v]) => v === "required" || v === "optional").map(([k]) => ({ race: "Robo Race", line: "Line Following", sumo: "Sumo" })[k as "race"]) as string[]) : [],
    qa: [],
    sim: simText,
  };
}
