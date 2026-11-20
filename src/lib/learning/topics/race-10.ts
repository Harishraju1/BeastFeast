import { defineTopic } from "../define";
import type { Topic } from "../types";

export const RACE_10: Topic[] = [
  defineTopic("race", 10, {
    slug: "tyre-materials",
    title: "Tyre Materials",
    minutes: 8,
    summary: "How rubber, silicone, foam, TPU and hard plastic tyres differ in grip, wear and consistency, and how to keep them working on race day.",
    introduction:
      "Every newton of force the motors produce reaches the track through a few square millimetres of tyre. The tyre material and its condition decide how much of that force becomes acceleration, braking and cornering, and how much is lost to wheelspin and sliding. Choosing and maintaining tyres is one of the cheapest ways to gain lap time.",
    beginner:
      "Think about running on a polished floor in socks versus in rubber-soled trainers. Your legs are just as strong in both cases, but in socks your feet slide and you cannot push off, stop or turn quickly. In trainers the rubber grips and all your strength goes into moving.\n\nRobot tyres are the robot's shoes. Soft rubber or silicone tyres grip well, so the robot can launch hard and take corners without sliding. Hard plastic wheels are like socks: cheap and long-lasting, but they slip, especially when you hit full power from a standstill.\n\nGrip also depends on how clean the tyre is. Dust from the track sticks to soft rubber and acts like tiny ball bearings, so a tyre that gripped perfectly in the morning may slide by the afternoon. Racers wipe their tyres before every run, sometimes by rolling them on sticky tape.\n\nThere is a trade-off: the softest, grippiest tyres wear out faster and pick up more dust. So pick a tyre that suits the track surface, keep a spare set, and clean them often.",
    technical: [
      {
        heading: "Friction and the traction limit",
        body:
          "The maximum force a tyre can transmit is approximately F_max = μ · N, where N is the normal load on that tyre. For a car with all its weight on driven wheels, the maximum acceleration is μ·g; for a corner of radius R, the maximum speed before sliding is v_max = √(μ · g · R).\n\nExample: a 0.5 kg robot with all weight on driven wheels. With μ = 0.9 the traction limit is 0.9 × 0.5 × 9.81 ≈ 4.4 N; with μ = 0.4 it drops to ≈ 2.0 N, halving achievable acceleration. In a 0.3 m radius turn, μ = 0.9 allows ≈ 1.6 m/s while μ = 0.4 allows only ≈ 1.1 m/s. (These μ values are examples for calculation; real values depend on the exact rubber and surface, so measure them.)",
      },
      {
        heading: "Material families",
        body:
          "- Soft rubber / silicone: high grip on smooth surfaces, picks up dust, wears faster. Softness is often described with a Shore A hardness number: lower = softer.\n- Harder rubber: lower grip but more consistent and durable.\n- Foam: light and grippy on some surfaces, can tear or compress.\n- TPU (flexible 3D-printing filament): lets you print custom tyres; grip depends on infill, pattern and hardness.\n- PLA/ABS hard plastic: very low grip on smooth tracks; mainly for prototypes.\n\nOn smooth flat tracks, a smooth (slick) tread usually maximises contact area; tread patterns help on loose or dirty surfaces.",
      },
      {
        heading: "Measuring μ yourself",
        body:
          "Place the robot (motors off, wheels locked or braked) on a sample of the track surface and tilt it slowly. At the angle θ where it just starts to slide, μ_static = tan θ. Example: sliding at 40° gives μ ≈ tan 40° ≈ 0.84. Repeat after a few runs to see how dust changes it.",
      },
    ],
    workingPrinciple:
      "Tyre grip comes from friction between the tyre and the track: adhesion of the rubber to the surface and deformation of the soft material around tiny bumps. The friction force can grow up to μ·N; beyond that the tyre slips and the transmitted force drops. Softer compounds deform more and grip more but wear and collect dust faster, so the best tyre is a balance of grip, consistency and durability for the specific surface.",
    diagrams: [
      { kind: "formula", latexish: "F_max = μ · N ;  v_corner = √(μ · g · R)", legend: { F_max: "maximum traction force (N)", "μ": "friction coefficient", N: "normal load on the tyre(s) (N)", v_corner: "maximum cornering speed (m/s)", R: "corner radius (m)", g: "9.81 m/s²" } },
      { kind: "flow", steps: ["Wipe tyres / roll on tape", "Check for tears and flat spots", "Tilt test to measure μ on track surface", "Adjust launch PWM ramp to stay under traction limit", "Race run", "Re-clean before the next run"] },
    ],
    examples: [
      {
        title: "Soft-start launch to avoid wheelspin",
        body: "Even with good tyres, jumping from 0 to 255 PWM can exceed the traction limit. Ramping up over about 150 ms keeps the wheels gripping and often gives a faster first metre.",
        code: `const int ENA = 5, IN1 = 7, IN2 = 8;
const int ENB = 6, IN3 = 9, IN4 = 10;

void setup() {
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  for (int pwm = 80; pwm <= 255; pwm += 25) {
    analogWrite(ENA, pwm);
    analogWrite(ENB, pwm);
    delay(20);
  }
}

void loop() {
}`,
      },
      {
        title: "Tape cleaning routine",
        body: "Before each run, roll each tyre over a strip of wide packing tape (sticky side up) taped to the table. Dust lifts off the rubber. Compare: robot launch distance in 0.5 s before and after cleaning, using a phone video against a ruler.",
      },
    ],
    commonMistakes: [
      { mistake: "Racing with dusty tyres.", why: "Dust layers drastically reduce friction, causing wheelspin and sliding in corners.", fix: "Clean tyres before every run and store the robot off the floor." },
      { mistake: "Using hard printed PLA wheels without tyres on a smooth track.", why: "Hard plastic has low friction on smooth surfaces, so the car spins its wheels and slides.", fix: "Fit rubber O-rings or TPU/silicone tyres over the rim." },
      { mistake: "Launching at full PWM instantly.", why: "Motor torque at start can exceed μ·N, so the tyres spin and the car launches slower.", fix: "Use a short PWM ramp and tune it on the actual track." },
    ],
    keyTakeaways: [
      "Traction force is limited to about μ·N.",
      "Maximum cornering speed is √(μ·g·R): grip directly limits corner speed.",
      "Soft compounds grip more but wear and collect dust faster.",
      "Measure μ with a tilt test: μ = tan θ at the slip angle.",
      "Clean tyres before every run and use a soft-start launch.",
    ],
    relatedComponents: ["Rubber Robot Wheels", "N20 Micro Metal Gear Motor", "BO Gear Motor"],
    youtubeSearch: "robot tyre grip silicone vs rubber wheels test",
    quiz: [
      {
        type: "mcq",
        prompt: "Why does wiping soft rubber tyres before a run often improve lap times?",
        options: ["It makes the tyres harder", "It increases the wheel diameter", "It lowers the robot's mass significantly", "It removes dust that lowers the friction coefficient"],
        answerIndex: 3,
        explanation: "Dust particles sit between rubber and track and reduce μ, so less force can be transmitted. Cleaning restores grip. It does not change tyre hardness, diameter or (meaningfully) mass.",
        difficulty: 1,
      },
      {
        type: "predict-movement",
        prompt: "A car with hard PLA wheels (no tyres) on a glossy track is started at analogWrite 255 instantly. What is the most likely result?",
        options: ["A perfect launch with no slip", "The robot flips over backwards", "The wheels spin and the car launches slowly", "The car drives in reverse"],
        answerIndex: 2,
        explanation: "Hard plastic on a glossy surface has a low μ, so the instant full torque exceeds the traction limit and the wheels spin, wasting the launch. Flipping requires much more torque and a high CG; direction is set by the IN pins, not grip.",
        difficulty: 1,
      },
      {
        type: "calculate",
        prompt: "A 0.5 kg robot has all its weight on driven wheels. Its tyres have μ = 0.9 on the track. What is the maximum traction force before wheelspin? (g = 9.81 m/s²)",
        options: ["0.45 N", "2.0 N", "4.4 N", "5.5 N"],
        answerIndex: 2,
        explanation: "F_max = μ · m · g = 0.9 × 0.5 × 9.81 ≈ 4.4 N. 0.45 N forgets to multiply by g (it is a mass times μ, not a force), and 2.0 N is the value for μ = 0.4.",
        difficulty: 2,
      },
      {
        type: "identify-component",
        prompt: "Which 3D-printing filament is flexible and commonly used to print custom grippy robot tyres?",
        options: ["PLA", "TPU", "ABS", "Acrylic"],
        answerIndex: 1,
        explanation: "TPU is a flexible thermoplastic elastomer, suitable for tyres. PLA and ABS are rigid and slippery as tyres, and acrylic is a rigid sheet material, not a printing filament.",
        difficulty: 1,
      },
    ],
  }),

  defineTopic("race", 11, {
    slug: "motor-drivers",
    title: "Motor Drivers",
    minutes: 11,
    summary: "How L298N, TB6612FNG and DRV8833 H-bridge drivers work, their pins and truth tables, and how to pick one for a race car.",
    introduction:
      "The motor driver is the muscle between the Arduino and the motors. It must handle the motor current, reverse direction, accept PWM for speed, and waste as little power as possible as heat. The three drivers you will meet most often are the L298N, the TB6612FNG and the DRV8833. They do the same job but differ a lot in efficiency, voltage range, current rating and pin names.",
    beginner:
      "Think of a motor driver as a set of four remote-controlled water valves arranged around a water wheel. Open the top-left and bottom-right valves and water pushes the wheel one way. Open top-right and bottom-left and it pushes the other way. Open the two bottom valves and the wheel is short-circuited to itself, so it stops quickly. Never open both valves on the same side, or water rushes straight through without turning anything: that is a short circuit.\n\nThis arrangement of four switches is called an H-bridge, because the motor sits in the middle like the bar of the letter H. The Arduino controls the 'valves' with small logic signals, and the driver connects the battery to the motor.\n\nTo control speed, the Arduino flicks the valves open and closed very fast with PWM. The longer they stay open in each cycle, the faster the motor turns.\n\nOld drivers like the L298N use transistors that waste a couple of volts as heat. Modern MOSFET drivers like the TB6612FNG and DRV8833 waste much less, so more of your battery's energy reaches the wheels. For a race car, that difference can mean noticeably more speed.",
    technical: [
      {
        heading: "H-bridge truth tables",
        body:
          "L298N (per channel: ENA, IN1, IN2):\n- EN high, IN1 = H, IN2 = L → forward\n- EN high, IN1 = L, IN2 = H → reverse\n- EN high, IN1 = IN2 → fast motor stop (brake)\n- EN low → free-running stop (coast)\nSpeed: PWM on ENA/ENB (remove the 5 V jumper caps on ENA/ENB).\n\nTB6612FNG (per channel: AIN1, AIN2, PWMA; shared STBY):\n- IN1 = H, IN2 = L, PWM = H → CW; IN1 = L, IN2 = H → CCW\n- IN1 = IN2 = H → short brake; IN1 = IN2 = L → stop (outputs off)\n- PWM low → short brake; STBY low → whole chip in standby (motors off). STBY must be driven HIGH to run.\n\nDRV8833 (per channel: xIN1, xIN2, no separate enable):\n- 1/0 forward, 0/1 reverse, 0/0 coast, 1/1 brake. Speed: PWM one input while holding the other at a fixed level. The nSLEEP pin must be high for the outputs to work (many modules pull it up).",
      },
      {
        heading: "Voltage drop and heat",
        body:
          "The L298N uses bipolar transistors; its two conducting switches together drop roughly 2 V at 1 A. At 1 A that is about 2 V × 1 A = 2 W of heat per channel, and the motor only sees about 5.4 V from a 7.4 V pack.\n\nThe TB6612FNG and DRV8833 use MOSFETs whose on-resistance is a fraction of an ohm (the TB6612FNG datasheet gives around 0.5 Ω typical for the upper plus lower switch). At 1 A that is about 0.5 V and 0.5 W, so the motor gets almost the full battery voltage.",
      },
      {
        heading: "Ratings at a glance (check your module's datasheet)",
        body:
          "- L298N: motor supply up to 46 V for the IC, about 2 A continuous per channel; heavy heatsink; large voltage drop. Module often includes a 5 V regulator enabled by a jumper (intended for supplies up to about 12 V).\n- TB6612FNG: motor supply (VM) up to 15 V maximum (recommended up to 13.5 V), logic VCC 2.7–5.5 V, about 1.2 A average and 3.2 A peak per channel.\n- DRV8833: motor supply about 2.7–10.8 V, about 1.5 A RMS (2 A peak) per channel; good for 1S–2S lithium packs and small N20/TT motors.\n\nAll three need a common ground with the Arduino.",
      },
    ],
    workingPrinciple:
      "An H-bridge has four switches around the motor. Closing a diagonal pair connects the battery across the motor in one polarity; closing the other diagonal reverses it. Closing both low-side switches shorts the motor terminals so its own back-EMF brakes it, and opening all switches lets it coast. PWM rapidly toggles the bridge so the average voltage across the motor, and hence its speed, follows the duty cycle. Logic inputs from the Arduino select which switches close.",
    diagrams: [
      { kind: "pinout", componentId: "l298n", highlight: ["ENA", "IN1", "IN2", "IN3", "IN4", "ENB"] },
      { kind: "pinout", componentId: "tb6612fng", highlight: ["PWMA", "AIN1", "AIN2", "STBY"] },
      { kind: "circuit", nodes: [ { id: "vp", label: "V+", x: 50, y: 5 }, { id: "s1", label: "S1 (high-left)", x: 20, y: 30 }, { id: "s2", label: "S2 (high-right)", x: 80, y: 30 }, { id: "m", label: "Motor", x: 50, y: 50 }, { id: "s3", label: "S3 (low-left)", x: 20, y: 70 }, { id: "s4", label: "S4 (low-right)", x: 80, y: 70 }, { id: "gnd", label: "GND", x: 50, y: 95 } ], edges: [ { from: "vp", to: "s1" }, { from: "vp", to: "s2" }, { from: "s1", to: "m", label: "forward: S1+S4" }, { from: "m", to: "s4" }, { from: "s2", to: "m", label: "reverse: S2+S3" }, { from: "m", to: "s3" }, { from: "s3", to: "gnd" }, { from: "s4", to: "gnd" } ] },
    ],
    examples: [
      {
        title: "TB6612FNG wiring and code",
        body: "Wiring: VM to battery + (≤ 13.5 V recommended), VCC to Arduino 5V, all GNDs together, PWMA → D5, AIN1 → D7, AIN2 → D8, PWMB → D6, BIN1 → D9, BIN2 → D10, STBY → D4, motors on AO1/AO2 and BO1/BO2.",
        code: `const int PWMA = 5, AIN1 = 7, AIN2 = 8;
const int PWMB = 6, BIN1 = 9, BIN2 = 10;
const int STBY = 4;

void motor(int pwmPin, int in1, int in2, int speed) {
  digitalWrite(in1, speed >= 0 ? HIGH : LOW);
  digitalWrite(in2, speed >= 0 ? LOW : HIGH);
  analogWrite(pwmPin, constrain(abs(speed), 0, 255));
}

void setup() {
  int pins[] = {PWMA, AIN1, AIN2, PWMB, BIN1, BIN2, STBY};
  for (int i = 0; i < 7; i++) pinMode(pins[i], OUTPUT);
  digitalWrite(STBY, HIGH);
}

void loop() {
  motor(PWMA, AIN1, AIN2, 220);
  motor(PWMB, BIN1, BIN2, 220);
  delay(2000);
  motor(PWMA, AIN1, AIN2, -150);
  motor(PWMB, BIN1, BIN2, 150);
  delay(500);
}`,
      },
      {
        title: "Why the same car is faster with a MOSFET driver",
        body: "With a 7.4 V pack and 1 A per motor, an L298N leaves about 5.4 V for the motor, a TB6612FNG about 6.9 V. Since no-load speed is roughly proportional to motor voltage, the TB6612FNG car's motors can spin about 6.9 / 5.4 ≈ 1.28 times faster at full PWM, around 28% more top speed, with far less heat in the driver.",
      },
    ],
    commonMistakes: [
      { mistake: "Leaving the ENA/ENB jumpers on the L298N while trying to PWM.", why: "The jumper ties EN to 5 V, so the channel is always fully enabled and PWM from the Arduino has no effect.", fix: "Remove the ENA/ENB jumper caps and wire ENA/ENB to Arduino PWM pins." },
      { mistake: "Forgetting STBY on the TB6612FNG.", why: "With STBY low or floating, the chip stays in standby and the motors never move.", fix: "Drive STBY HIGH from a pin (or tie it to VCC)." },
      { mistake: "No common ground between driver and Arduino.", why: "Logic signals are measured relative to ground; without a shared reference the driver sees random levels.", fix: "Connect Arduino GND to the driver GND and the battery negative." },
      { mistake: "Running a DRV8833 or TB6612FNG above its voltage rating.", why: "MOSFET drivers have hard maximum motor voltages and are destroyed by overvoltage.", fix: "Check the maximum (DRV8833 ~10.8 V, TB6612FNG 15 V absolute) against your fully charged battery." },
    ],
    keyTakeaways: [
      "An H-bridge uses four switches to drive a motor in both directions, brake or coast.",
      "L298N: ENA/IN1/IN2, about 2 V drop and lots of heat.",
      "TB6612FNG: PWMA/AIN1/AIN2 plus STBY that must be HIGH; low drop.",
      "DRV8833: two inputs per channel, PWM on an input, 2.7–10.8 V.",
      "Always share ground and check current and voltage ratings.",
    ],
    relatedComponents: ["L298N", "TB6612FNG", "DRV8833", "Arduino Uno R3", "N20 Micro Metal Gear Motor"],
    youtubeSearch: "L298N vs TB6612FNG vs DRV8833 motor driver comparison",
    quiz: [
      {
        type: "identify-driver",
        prompt: "A small purple motor driver board has pins labelled VM, VCC, GND, PWMA, AIN1, AIN2, PWMB, BIN1, BIN2, STBY, AO1, AO2, BO1, BO2. Which driver is it?",
        options: ["L298N", "DRV8833", "TB6612FNG", "L9110S"],
        answerIndex: 2,
        explanation: "PWMA/PWMB with AIN/BIN inputs and a STBY pin are the signature of the TB6612FNG. The L298N uses ENA/IN1–IN4, and the DRV8833 has no separate PWM pins (speed is PWM on its IN pins).",
        difficulty: 1,
      },
      {
        type: "identify-pin",
        prompt: "On an L298N module with the jumper caps removed, which pin should receive the Arduino's PWM signal to control the speed of motor A?",
        diagram: { kind: "pinout", componentId: "l298n" },
        options: ["IN1", "ENA", "OUT1", "5V"],
        answerIndex: 1,
        explanation: "ENA enables bridge A; PWM on ENA switches it on and off and sets the average speed. IN1/IN2 set direction (PWM there is possible but not the standard L298N wiring), OUT1 goes to the motor, and the 5V pin is a supply pin.",
        difficulty: 1,
      },
      {
        type: "find-wrong-connection",
        prompt: "The motors twitch randomly and do not follow the code. Which connection is missing or wrong?",
        diagram: { kind: "circuit", nodes: [ { id: "bat", label: "7.4 V battery", x: 10, y: 20 }, { id: "drv", label: "L298N", x: 50, y: 20 }, { id: "uno", label: "Arduino Uno (USB powered)", x: 50, y: 80 }, { id: "m", label: "Motor A", x: 90, y: 20 } ], edges: [ { from: "bat", to: "drv", label: "+ to 12V" }, { from: "bat", to: "drv", label: "− to GND" }, { from: "uno", to: "drv", label: "D5 → ENA, D7 → IN1, D8 → IN2" }, { from: "drv", to: "m", label: "OUT1/OUT2" } ] },
        options: ["Battery + should go to the 5V terminal", "OUT1/OUT2 should go to the Arduino", "D5 cannot be used for ENA", "There is no ground wire between the Arduino and the L298N"],
        answerIndex: 3,
        explanation: "The Arduino is powered over USB and shares no ground with the driver, so the driver cannot interpret the logic levels reliably. Add a wire from Arduino GND to L298N GND. D5 is a valid PWM pin, and a 7.4 V pack belongs on the 12V (VS) terminal, not 5V.",
        difficulty: 2,
      },
      {
        type: "predict-circuit",
        prompt: "On an L298N, the ENA jumper cap is still fitted and the Arduino's pin 5 is not connected to anything on the driver. The code sets IN1 HIGH, IN2 LOW and calls analogWrite(5, 80). What does motor A do?",
        options: ["Runs at about 31% speed", "Does not run", "Runs at full speed", "Runs in reverse at low speed"],
        answerIndex: 2,
        explanation: "The jumper ties ENA to 5 V, so the bridge is permanently enabled; with IN1 HIGH and IN2 LOW the motor runs forward at full speed. analogWrite(5, 80) goes nowhere. 31% (80/255) would only happen if pin 5 were wired to ENA with the jumper removed.",
        difficulty: 2,
      },
      {
        type: "debug-code",
        prompt: "A TB6612FNG is wired correctly (STBY → D4). Nothing moves when this code runs. What is the bug?",
        code: `const int PWMA = 5, AIN1 = 7, AIN2 = 8, STBY = 4;

void setup() {
  pinMode(PWMA, OUTPUT);
  pinMode(AIN1, OUTPUT);
  pinMode(AIN2, OUTPUT);
  pinMode(STBY, OUTPUT);
}

void loop() {
  digitalWrite(AIN1, HIGH);
  digitalWrite(AIN2, LOW);
  analogWrite(PWMA, 200);
}`,
        options: ["STBY is never set HIGH, so the chip stays in standby", "analogWrite cannot be used in loop()", "AIN1 and AIN2 must both be HIGH to move", "Pin 5 is not a PWM pin"],
        answerIndex: 0,
        explanation: "After pinMode(STBY, OUTPUT) the pin is LOW, which keeps the TB6612FNG in standby. Add digitalWrite(STBY, HIGH) in setup(). Both IN pins HIGH is the short-brake state, not drive, and pin 5 is a valid PWM pin.",
        difficulty: 2,
      },
    ],
  }),

  defineTopic("race", 12, {
    slug: "battery-selection",
    title: "Battery Selection",
    minutes: 10,
    summary: "Choosing battery chemistry, voltage, capacity and discharge rating so a race car stays fast for the whole run.",
    introduction:
      "The battery sets the voltage your motors can use, how much current they can draw before the voltage sags, and how long the car stays competitive. A weak battery makes even great motors slow. This topic compares common chemistries, explains series and parallel packs, capacity and C-rating, and shows how to estimate run time and voltage sag.",
    beginner:
      "A battery is like a water tank on a roof feeding a water wheel. The height of the tank is the voltage: higher means more pressure and a faster wheel. The size of the tank is the capacity: bigger means it lasts longer. The width of the pipe is how much current the battery can deliver at once: a narrow pipe cannot feed a hungry motor, no matter how big the tank.\n\nSmall 9 V 'PP3' batteries have a high tank but a very narrow pipe. When motors start, the voltage collapses and the Arduino may even reset. AA alkaline cells are a bit better but still struggle with high current. Rechargeable lithium cells such as 18650 Li-ion or LiPo packs have wide pipes and good capacity, which is why race cars use them.\n\nLithium cells must be treated with respect. They should not be over-charged, over-discharged, short-circuited or punctured. Use a proper charger, a battery holder or connector that cannot short, and a switch so you can turn the robot off between runs. Choose the battery voltage to suit your motors and driver, then choose capacity so the car stays strong for the whole competition round.",
    technical: [
      {
        heading: "Chemistries and voltages",
        body:
          "- Alkaline AA: 1.5 V nominal, high internal resistance, voltage drops a lot under motor load; not rechargeable.\n- NiMH AA: 1.2 V nominal, rechargeable, handles moderate current.\n- 9 V PP3: small capacity and high internal resistance; unsuitable for motors.\n- Li-ion (e.g. 18650 cells, 18 mm × 65 mm): 3.6–3.7 V nominal, 4.2 V full, good capacity, moderate to high current depending on the cell.\n- LiPo pouch packs: 3.7 V nominal per cell, 4.2 V full, very high current capability (C-rating), light, need careful handling.\n\nCells in series add voltage: 2S = 7.4 V nominal (8.4 V full), 3S = 11.1 V nominal (12.6 V full). Cells in parallel add capacity at the same voltage.",
      },
      {
        heading: "Capacity, C-rating and run time",
        body:
          "Capacity is in mAh: a 2000 mAh pack can, in theory, supply 2 A for 1 hour or 1 A for 2 hours. Run time t ≈ capacity / average current. Example: 2000 mAh at 1.5 A average gives about 1.33 h (80 min); plan for less in practice because you should not fully discharge lithium cells and capacity falls at high currents.\n\nLiPo packs quote a C-rating: maximum continuous current = C × capacity in Ah. A 1300 mAh 25C pack can supply 25 × 1.3 = 32.5 A. Li-ion cells list a maximum continuous discharge current in amps instead; check the datasheet of the exact cell.",
      },
      {
        heading: "Voltage sag and internal resistance",
        body:
          "A battery behaves like an ideal voltage E in series with an internal resistance R_int. Under load current I, the terminal voltage is V = E − I · R_int.\n\nExample (illustrative values): a pack with E = 7.6 V and R_int = 0.3 Ω gives 7.3 V at 1 A but only 6.4 V at 4 A during a hard launch. High-internal-resistance batteries (alkaline, 9 V) sag so much that motors lose torque exactly when they need it and the Arduino can brown out.",
      },
      {
        heading: "Matching battery to driver and Arduino",
        body:
          "- The fully charged voltage must not exceed the driver's maximum (e.g. DRV8833 about 10.8 V, so 2S is fine but 3S is not).\n- The L298N's ~2 V drop wastes a large share of a low-voltage pack; prefer MOSFET drivers for 1S–2S.\n- The Uno's Vin pin (or barrel jack) feeds its onboard regulator and expects roughly 7–12 V, so a 2S pack can power it through Vin; never connect a 7.4 V pack to the 5V pin.",
      },
    ],
    workingPrinciple:
      "A battery converts stored chemical energy into electrical energy at a voltage set by its chemistry and number of series cells. Its capacity limits total energy and its internal resistance limits how much current it can deliver without the terminal voltage sagging. Matching chemistry, series count, capacity and current capability to the motors and driver keeps the motor voltage high throughout the run.",
    diagrams: [
      { kind: "formula", latexish: "V_terminal = E − I · R_int ;  t ≈ C / I_avg ;  I_max = C-rating × Ah", legend: { E: "open-circuit battery voltage (V)", I: "load current (A)", R_int: "internal resistance (Ω)", C: "capacity (Ah)", I_avg: "average current (A)" } },
      { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["VIN", "5V", "GND1"] },
    ],
    examples: [
      {
        title: "Sizing a pack for a race day",
        body: "A 4WD car has four N20 motors averaging about 0.4 A each during driving, plus 0.1 A for the electronics: 1.7 A total. Each heat lasts about 2 minutes and you expect 10 runs and 20 minutes of testing: 40 minutes total. Required capacity ≈ 1.7 A × 0.67 h ≈ 1.1 Ah. A 2S 18650 pack of typical 2000+ mAh cells gives a comfortable margin; a 2S 500 mAh LiPo would need recharging mid-event.",
      },
      {
        title: "Logging battery voltage under load",
        body: "Measure your pack through a 10 kΩ/10 kΩ divider on A0 (halving 8.4 V to 4.2 V, safely below 5 V). Print the voltage while launching to see the sag.",
        code: `const int BAT_PIN = A0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(BAT_PIN);
  float volts = raw * 5.0 / 1023.0 * 2.0;
  Serial.print("Battery: ");
  Serial.print(volts);
  Serial.println(" V");
  delay(200);
}`,
      },
    ],
    commonMistakes: [
      { mistake: "Powering motors from a 9 V PP3 battery.", why: "Its high internal resistance and small capacity make the voltage collapse under motor current, causing weak motors and Arduino resets.", fix: "Use a 2S Li-ion/LiPo pack or a NiMH pack able to supply the motor current." },
      { mistake: "Comparing nominal voltage with a driver's maximum rating.", why: "Lithium cells reach 4.2 V each when full, so 3S is 12.6 V, not 11.1 V.", fix: "Always check the fully charged voltage against driver and rule limits." },
      { mistake: "Running lithium cells until the robot stops.", why: "Deep discharge damages lithium cells and can make them unsafe to recharge.", fix: "Monitor voltage and stop at a safe per-cell limit (around 3.0–3.3 V per cell is commonly used); use a proper lithium charger." },
    ],
    keyTakeaways: [
      "Voltage sets motor speed potential; capacity sets run time; internal resistance sets sag.",
      "Series cells add voltage: 2S lithium = 7.4 V nominal, 8.4 V full.",
      "LiPo maximum current = C-rating × capacity in Ah.",
      "Avoid 9 V PP3 and alkaline cells for motors.",
      "Check the fully charged voltage against your driver and the club rules.",
    ],
    relatedComponents: ["18650 Li-ion Cell", "LiPo 2S Battery", "18650 Dual Cell Holder", "Arduino Uno R3", "DRV8833"],
    youtubeSearch: "18650 vs LiPo battery for robot car beginners",
    quiz: [
      {
        type: "calculate",
        prompt: "A LiPo pack is labelled 1300 mAh 25C. What is its maximum continuous discharge current?",
        options: ["52 A", "1.3 A", "25 A", "32.5 A"],
        answerIndex: 3,
        explanation: "I_max = C-rating × capacity in Ah = 25 × 1.3 = 32.5 A. Using 25 A treats the C-rating as amps directly; 1.3 A is just the 1C current.",
        difficulty: 2,
      },
      {
        type: "identify-component",
        prompt: "Which battery is a cylindrical rechargeable lithium-ion cell about 18 mm in diameter and 65 mm long, with a nominal voltage of about 3.6–3.7 V?",
        options: ["9 V PP3", "18650 Li-ion cell", "AA NiMH cell", "CR2032 coin cell"],
        answerIndex: 1,
        explanation: "The 18650's name comes from its size: 18 mm × 65 mm. An AA cell is about 14.5 mm × 50 mm and NiMH is 1.2 V; a PP3 is rectangular; a CR2032 is a 3 V coin cell.",
        difficulty: 1,
      },
      {
        type: "predict-circuit",
        prompt: "A race car's Arduino, L298N and two motors are all powered from one 9 V PP3 battery. What is most likely to happen when both motors start at full PWM?",
        options: ["The motors run faster than on a 2S Li-ion pack", "The battery voltage sags heavily, the motors are weak and the Arduino may reset", "Nothing changes because the L298N regulates the voltage", "The battery voltage rises because of back-EMF"],
        answerIndex: 1,
        explanation: "A PP3's high internal resistance means V = E − I·R_int collapses under motor current, starving the motors and possibly dropping the Arduino supply below its working level (a brown-out reset). The L298N does not regulate motor voltage, and back-EMF does not raise battery voltage while driving.",
        difficulty: 2,
      },
      {
        type: "identify-driver",
        prompt: "Your car runs on a single 1S LiPo (3.7 V nominal, 4.2 V full). Which driver suits this low voltage best?",
        options: ["L298N", "TB6612FNG", "DRV8833", "Any of them works equally well"],
        answerIndex: 2,
        explanation: "The DRV8833 operates from about 2.7 V and has low on-resistance, so a 1S pack works well. The L298N would drop about 2 V, leaving under 2 V for the motors, and the TB6612FNG's recommended motor supply starts at 4.5 V, above a 1S pack for most of its discharge.",
        difficulty: 3,
      },
      {
        type: "identify-pin",
        prompt: "You want to power an Arduino Uno from a 2S Li-ion pack (7.4 V nominal) through its onboard regulator. Which pin should the pack's positive wire go to?",
        diagram: { kind: "pinout", componentId: "arduino-uno-r3" },
        options: ["Vin", "5V", "3.3V", "AREF"],
        answerIndex: 0,
        explanation: "Vin feeds the onboard regulator, which expects roughly 7–12 V and produces 5 V. Connecting 7.4 V to the 5V pin bypasses the regulator and can destroy the board; 3.3V is an output and AREF is the ADC reference input.",
        difficulty: 1,
      },
    ],
  }),
];
