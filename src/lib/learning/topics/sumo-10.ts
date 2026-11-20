import { defineTopic } from "../define";
import type { Topic } from "../types";

export const SUMO_10: Topic[] = [
  defineTopic("sumo", 10, {
    slug: "sumo-front-wedge-design",
    title: "Front Wedge Design",
    minutes: 10,
    summary: "How a front wedge gets under the opponent, the geometry of wedge angle and lift, and how to build an edge that stays on the floor.",
    introduction:
      "The front wedge (or scoop) is the sumo robot's main tactical tool. A wedge that slides under the opponent lifts part of their weight off their wheels, cutting their traction while yours stays the same. Most close matches between evenly built robots are decided by whose wedge edge gets underneath first. This topic covers wedge geometry, materials and construction.",
    beginner:
      "Have you ever used a doorstop? You push the thin edge under the door and the slope lifts and jams it. A sumo wedge does the same thing to the opponent. The thin front edge slides underneath, and as your robot drives forward the slope lifts the front of the other robot.\n\nWhy does lifting help? Remember that grip depends on how hard the wheels are pressed onto the floor. When you lift the front of the opponent, some of their weight rests on your wedge instead of on their own wheels. Their wheels lose grip and start to slip, while your wheels keep pushing at full strength. Now the stronger robot is you.\n\nThe secret of a good wedge is the edge. It must be thin, straight and pressed right down to the floor across its whole width, so there is no gap for the opponent's wedge to sneak under. Many builders use a thin steel blade at the front edge because it stays straight and does not chip. The slope angle matters too: a shallow slope slides under easily but lifts slowly, while a steep slope lifts quickly but is harder to get underneath with.",
    technical: [
      {
        heading: "Wedge geometry",
        body:
          "A straight wedge of height h and horizontal length L has angle θ with tan θ = h / L.\n\n- Lift per distance travelled: Δh = Δx × tan θ. With θ ≈ 26.6° (h = 20 mm, L = 40 mm), each 10 mm of travel under the opponent lifts their edge 5 mm.\n- For an ideal frictionless ramp, the contact force is perpendicular to the ramp surface, so the ratio of vertical lift force to horizontal push on the opponent's edge is about 1 / tan θ. Shallow wedges produce a large lifting component for a given horizontal push.\n\nReal contacts have friction, and the opponent's edge may be a wedge too, so practical angles are a compromise found by testing. Curved (concave) scoops start shallow at the edge and steepen higher up."
      },
      {
        heading: "The edge: the most important millimetre",
        body:
          "Whoever's edge is lower gets under. Design points:\n\n- The edge should touch the floor along its full width when the robot sits still. Even a 0.5 mm gap or a slightly bent corner can let the opponent's edge under.\n- Thin steel (for example a ground steel strip) keeps a straight, durable edge. Plastic edges chip and round off.\n- Mount the wedge with a little downward load (see Weight Distribution) or a hinged/sprung mount so it follows the ring surface.\n- Many rulebooks forbid edges that cut or damage the ring surface; check your club rulebook and avoid razor-sharp edges for safety."
      },
      {
        heading: "Wedge versus wedge",
        body:
          "When two wedges meet, the lower and flatter edge usually wins. A robot whose edge rides up onto the other wedge becomes the one being lifted. Side and rear protection also matter: a robot that is attacked from the side should not present a vertical wall with a gap under it. Some designs add wedges or skirts on the sides within the 10 × 10 cm footprint."
      }
    ],
    workingPrinciple:
      "As the wedge edge slides under the opponent and the robot drives forward, the inclined surface converts horizontal motion into vertical lift of the opponent's front. Part of the opponent's weight transfers onto the wedge, reducing the normal force on their driven wheels and therefore their maximum pushing force μN. Meanwhile your own driven wheels keep their load, so the force balance tips in your favour.",
    diagrams: [
      {
        kind: "formula",
        latexish: "tan θ = h / L,  Δh = Δx · tan θ",
        legend: { "θ": "wedge angle from the floor", h: "wedge height", L: "wedge horizontal length", "Δx": "distance driven under the opponent", "Δh": "lift of the opponent's edge" }
      },
      {
        kind: "flow",
        steps: [
          "Wedge edge touches floor across full width",
          "Edge slides under opponent's front edge",
          "Robot drives forward; slope lifts opponent",
          "Opponent's wheels lose normal force and grip",
          "Your wheels keep full traction; push opponent out"
        ]
      }
    ],
    examples: [
      {
        title: "Choosing a wedge angle",
        body:
          "A builder has 40 mm of length available for the wedge. At h = 15 mm, tan θ = 0.375 (θ ≈ 20.6°): easy to slide under, lifts 3.75 mm per 10 mm travel. At h = 30 mm, tan θ = 0.75 (θ ≈ 36.9°): lifts 7.5 mm per 10 mm but the opponent's edge is more likely to jam against the face rather than ride up. The builder makes both from card, tests against club robots, then builds the better one in steel."
      },
      {
        title: "Flat-edge check",
        body:
          "Place the robot on a sheet of glass or a flat tile and shine a torch from behind the wedge. Any light visible under the edge shows a gap. Shim or bend the mount until no light passes along the full width. Repeat after every few matches, since collisions can bend the blade."
      }
    ],
    commonMistakes: [
      {
        mistake: "Wedge edge sitting slightly above the floor",
        why: "Any gap lets the opponent's edge slide under yours, and then you are the one being lifted.",
        fix: "Adjust the mount so the edge touches the floor along its full width; check with the light test."
      },
      {
        mistake: "Thick plastic edge that rounds over",
        why: "A rounded or chipped edge rides up over the opponent's wedge instead of under it.",
        fix: "Use a thin steel strip at the leading edge, ground straight (not dangerously sharp)."
      },
      {
        mistake: "Very steep wedge face",
        why: "A steep face behaves like a wall; the opponent's edge jams against it instead of riding up.",
        fix: "Use a shallower angle or a curved scoop that starts shallow at the edge."
      }
    ],
    keyTakeaways: [
      "A wedge lifts the opponent, reducing their normal force and traction.",
      "tan θ = h / L; lift per travel is Δx × tan θ.",
      "The lower, flatter, straighter edge wins wedge-versus-wedge battles.",
      "Thin steel edges stay straight; check for gaps with a light test.",
      "Follow the rulebook on edges that might damage the ring."
    ],
    relatedComponents: ["Replaceable Sumo Blade", "N20 Micro Metal Gear Motor", "Arduino Nano"],
    youtubeSearch: "mini sumo robot wedge blade design",
    quiz: [
      {
        type: "mcq",
        prompt: "What is the main mechanical reason a wedge helps win a sumo push?",
        options: [
          "It makes the robot look more aggressive",
          "It protects the ultrasonic sensor",
          "It increases your motor torque",
          "It lifts the opponent, reducing the normal force on their wheels and so their traction"
        ],
        answerIndex: 3,
        explanation:
          "Lifting transfers part of the opponent's weight onto your wedge, so their μN limit drops. A wedge does not change your motor torque; it changes the force balance by weakening the opponent's traction.",
        difficulty: 1
      },
      {
        type: "calculate",
        prompt: "A straight wedge is 20 mm high and 40 mm long horizontally. What is its angle to the floor (θ = arctan(h/L))?",
        options: ["26.6°", "63.4°", "30.0°", "45.0°"],
        answerIndex: 0,
        explanation:
          "tan θ = 20 / 40 = 0.5, so θ = arctan 0.5 ≈ 26.6°. 63.4° is arctan(40/20), which swaps height and length. 45° would need h = L.",
        difficulty: 2
      },
      {
        type: "predict-movement",
        prompt:
          "Robot A's wedge edge touches the floor along its full width. Robot B's wedge edge has a 1 mm gap under it. They meet head-on at the same speed. What is the most likely outcome?",
        options: [
          "B's edge slides under A and A is lifted",
          "Both robots bounce apart and stop",
          "A's edge slides under B, B rides up and loses traction",
          "Both robots lift each other equally"
        ],
        answerIndex: 2,
        explanation:
          "A's edge is lower, so it slips into B's 1 mm gap. B rides up A's slope, its wheels unload and A pushes it out. The tempting idea that equal speeds give equal results ignores that the lower edge decides who goes under.",
        difficulty: 2
      },
      {
        type: "identify-component",
        prompt:
          "A sumo builder fixes a thin, flat, ground metal strip along the very front lower edge of the robot. What is this part?",
        options: [
          "Wedge blade (scoop edge)",
          "Heat sink",
          "Bumper switch lever",
          "Battery holder"
        ],
        answerIndex: 0,
        explanation:
          "A thin steel strip at the front lower edge is the wedge blade; it keeps the leading edge straight and low so it can slide under the opponent. A bumper switch lever is a sensor actuator, and a heat sink cools electronics.",
        difficulty: 1
      }
    ]
  }),

  defineTopic("sumo", 11, {
    slug: "sumo-motor-drivers",
    title: "Motor Drivers",
    minutes: 12,
    summary: "How H-bridge motor drivers control speed and direction, and how to choose and wire L298N, TB6612FNG and DRV8833 for a sumo robot.",
    introduction:
      "A microcontroller pin can supply only a few tens of milliamps, while a sumo motor near stall can draw an ampere or more. A motor driver sits between them: it takes small logic signals and switches the battery current through the motors in either direction. This topic explains the H-bridge, the input truth tables of common drivers, and how to choose one for the high currents of a pushing match.",
    beginner:
      "Think of a motor driver as a set of heavy-duty switches controlled by the Arduino. The Arduino is like a person pressing light switches; the driver is the electrical wiring that can carry the big current to the motors. The Arduino could never power a motor directly — its pins are only rated for about 20 mA continuously and 40 mA absolute maximum.\n\nInside the driver is an H-bridge: four switches arranged in the shape of the letter H with the motor in the middle. Closing one diagonal pair sends current one way through the motor (forward). Closing the other pair sends current the other way (reverse). Switching rapidly on and off with PWM controls the speed.\n\nSumo robots commonly use three drivers. The L298N is big, cheap and tough but wastes about 2 volts as heat. The TB6612FNG is tiny and efficient, good up to about 1.2 A per motor continuously. The DRV8833 is also small and efficient, for supplies up to about 10.8 V. Choosing the right driver means matching the motor voltage and the high current your motors draw when pushing hard.",
    technical: [
      {
        heading: "H-bridge operation and decay modes",
        body:
          "Four switches (transistors) Q1–Q4 form an H with the motor across the middle. Q1+Q4 on: current flows A→B (forward). Q2+Q3 on: current flows B→A (reverse). Both low-side switches on: the motor terminals are shorted together, which brakes the motor quickly (short brake / slow decay). All switches off: the motor coasts (fast decay through diodes).\n\nNever turn on both switches on the same side (Q1+Q2): that shorts the supply ('shoot-through'). Integrated drivers include logic to prevent this when used correctly."
      },
      {
        heading: "Truth tables of common drivers",
        body:
          "L298N (per channel): ENA must be HIGH (or PWM) for the outputs to drive. IN1=H, IN2=L → forward; IN1=L, IN2=H → reverse; IN1=IN2 → fast motor stop (brake); ENA=L → free-running stop (coast).\n\nTB6612FNG (per channel): STBY must be HIGH. IN1=H, IN2=L → forward (CW); IN1=L, IN2=H → reverse (CCW); IN1=IN2=H → short brake; IN1=IN2=L → stop (outputs off). Speed is set by PWM on PWMA/PWMB.\n\nDRV8833 (per channel, no separate enable): xIN1=1, xIN2=0 → forward; 0,1 → reverse; 0,0 → coast; 1,1 → brake. Speed: PWM one input while holding the other (low for fast-decay PWM, high for slow-decay PWM with inverted duty)."
      },
      {
        heading: "Choosing a driver for sumo",
        body:
          "- L298N: bipolar transistors, motor supply well above 12 V possible; module typically rated up to about 2 A per channel; voltage drop around 2 V at 1 A, so a 7.4 V pack gives the motors only about 5.4 V; large and heavy for mini-sumo.\n- TB6612FNG: MOSFET, VM up to 15 V, about 1.2 A continuous and 3.2 A peak per channel, logic 2.7–5.5 V; very low drop; needs STBY HIGH.\n- DRV8833: MOSFET, 2.7–10.8 V, about 1.5 A RMS (2 A peak) per channel; small; has nSLEEP (pull high to run).\n\nSize for stall current. If your motors stall at 1.6 A each, the TB6612FNG's peak rating covers short pushes but long stalls will heat it; consider larger drivers for bigger classes."
      },
      {
        heading: "PWM resolution and percentages",
        body:
          "analogWrite(pin, value) on the Uno takes 0–255 (8-bit). Duty cycle percentage = value / 255 × 100. Average motor voltage ≈ duty × V_supply (minus driver drop). Example: analogWrite 191 at 7.4 V ⇒ duty ≈ 74.9 percent ⇒ about 5.5 V average for a MOSFET driver. Uno PWM pins are 3, 5, 6, 9, 10, 11 (about 490 Hz, with 5 and 6 at about 980 Hz)."
      }
    ],
    workingPrinciple:
      "The driver's logic inputs select which transistors of the H-bridge conduct. Current flows from the motor supply through one high-side switch, through the motor, and back through the opposite low-side switch, setting the direction. Pulse-width modulation switches the bridge on and off rapidly; the motor's inductance and inertia average the pulses, so speed follows the duty cycle. Braking shorts the motor terminals so its back-EMF drives a current that opposes rotation.",
    diagrams: [
      {
        kind: "pinout",
        componentId: "tb6612fng",
        highlight: ["STBY", "PWMA", "AIN1", "AIN2", "VM"]
      },
      {
        kind: "circuit",
        nodes: [
          { id: "vm", label: "V+ (battery)", x: 200, y: 20 },
          { id: "q1", label: "Q1 high-left", x: 80, y: 90 },
          { id: "q3", label: "Q3 high-right", x: 320, y: 90 },
          { id: "mot", label: "Motor", x: 200, y: 160 },
          { id: "q2", label: "Q2 low-left", x: 80, y: 230 },
          { id: "q4", label: "Q4 low-right", x: 320, y: 230 },
          { id: "gnd", label: "GND", x: 200, y: 300 }
        ],
        edges: [
          { from: "vm", to: "q1" },
          { from: "vm", to: "q3" },
          { from: "q1", to: "mot", label: "A", color: "green" },
          { from: "mot", to: "q4", label: "B", color: "green" },
          { from: "q3", to: "mot" },
          { from: "mot", to: "q2" },
          { from: "q2", to: "gnd" },
          { from: "q4", to: "gnd", color: "green" }
        ]
      }
    ],
    examples: [
      {
        title: "TB6612FNG drive function",
        body:
          "A single drive(left, right) function accepting −255…255 for each motor. Negative values reverse.",
        code: `const int PWMA = 5, AIN1 = 7, AIN2 = 8;
const int PWMB = 6, BIN1 = 4, BIN2 = 2;
const int STBY = 3;

void setMotor(int pwmPin, int in1, int in2, int speed) {
  if (speed >= 0) {
    digitalWrite(in1, HIGH);
    digitalWrite(in2, LOW);
  } else {
    digitalWrite(in1, LOW);
    digitalWrite(in2, HIGH);
    speed = -speed;
  }
  analogWrite(pwmPin, constrain(speed, 0, 255));
}

void drive(int left, int right) {
  setMotor(PWMA, AIN1, AIN2, left);
  setMotor(PWMB, BIN1, BIN2, right);
}

void setup() {
  int outs[] = {PWMA, AIN1, AIN2, PWMB, BIN1, BIN2, STBY};
  for (int i = 0; i < 7; i++) pinMode(outs[i], OUTPUT);
  digitalWrite(STBY, HIGH); // leave standby
  delay(5000);
}

void loop() {
  drive(200, 200);   // forward
  delay(1000);
  drive(-150, 150);  // spin
  delay(500);
}`
      },
      {
        title: "L298N wiring summary",
        body:
          "- 12V terminal: battery + (through the power switch).\n- GND terminal: battery − AND Arduino GND (common ground).\n- ENA, ENB: Arduino PWM pins (remove the ENA/ENB jumpers to use PWM).\n- IN1–IN4: Arduino digital pins.\n- OUT1/OUT2: left motor; OUT3/OUT4: right motor.\n- With the onboard 5 V regulator jumper fitted, keep the supply at or below about 12 V."
      }
    ],
    commonMistakes: [
      {
        mistake: "Leaving TB6612FNG STBY unconnected or tied to GND",
        why: "With STBY low the driver stays in standby and the motors never move.",
        fix: "Connect STBY to an Arduino pin set HIGH, or to the logic supply."
      },
      {
        mistake: "Setting IN1 and IN2 both HIGH to reverse",
        why: "Equal inputs brake the motor; reverse needs IN1 LOW and IN2 HIGH.",
        fix: "Follow the truth table: opposite levels for direction, equal levels for brake/stop."
      },
      {
        mistake: "Using an L298N on a low-voltage pack without accounting for its drop",
        why: "About 2 V is lost in the driver, so a 7.4 V pack delivers only about 5.4 V to the motors, reducing torque and speed.",
        fix: "Use a MOSFET driver (TB6612FNG, DRV8833) for low-voltage sumo robots."
      }
    ],
    keyTakeaways: [
      "An H-bridge reverses motor current with two diagonal switch pairs.",
      "Opposite input levels set direction; equal levels brake or coast.",
      "TB6612FNG needs STBY HIGH; L298N needs ENA/ENB HIGH or PWM.",
      "MOSFET drivers waste far less voltage than the L298N.",
      "Choose a driver rated for your motors' stall current and supply voltage."
    ],
    relatedComponents: ["L298N", "TB6612FNG", "DRV8833", "Arduino Uno R3", "N20 Micro Metal Gear Motor"],
    youtubeSearch: "TB6612FNG vs L298N vs DRV8833 motor driver comparison",
    quiz: [
      {
        type: "identify-driver",
        prompt:
          "A small driver board has pins AIN1, AIN2, BIN1, BIN2, nSLEEP and works from 2.7–10.8 V. It has no separate PWM or enable pin per motor; you PWM one of the two inputs. Which driver is it?",
        options: ["L298N", "TB6612FNG", "DRV8833", "L293D"],
        answerIndex: 2,
        explanation:
          "The DRV8833 uses two inputs per channel (both PWM-capable), has an nSLEEP pin and a 2.7–10.8 V range. The TB6612FNG looks similar but has separate PWMA/PWMB pins and a STBY pin, and the L298N has ENA/ENB.",
        difficulty: 2
      },
      {
        type: "identify-pin",
        prompt: "On a TB6612FNG, which pin must be driven HIGH for either motor output to work?",
        options: [
          "VM",
          "PWMB",
          "AO1",
          "STBY"
        ],
        answerIndex: 3,
        explanation:
          "STBY (standby) must be HIGH to enable the driver; when LOW the outputs are disabled. VM is the motor supply input, AO1 is a motor output, and PWMB only sets the speed of channel B.",
        difficulty: 1,
        diagram: { kind: "pinout", componentId: "tb6612fng" }
      },
      {
        type: "find-wrong-connection",
        prompt:
          "Neither motor moves. Which connection in this TB6612FNG wiring is wrong?\n\nA) VM → battery + (7.4 V)\nB) VCC → Arduino 5V\nC) STBY → GND\nD) PWMA → Arduino D5",
        options: ["A", "B", "C", "D"],
        answerIndex: 2,
        explanation:
          "STBY tied to GND keeps the chip permanently in standby, so neither channel drives. It must be HIGH. A (motor supply), B (logic supply) and D (PWM to a PWM-capable pin) are all correct.",
        difficulty: 2
      },
      {
        type: "code-output",
        prompt: "What does this code print?",
        code: `void setup() {
  Serial.begin(9600);
  int pwmValue = 191;
  long percent = (long)pwmValue * 100 / 255;
  Serial.println(percent);
}

void loop() {}`,
        options: ["75", "74", "74.9", "191"],
        answerIndex: 1,
        explanation:
          "191 × 100 = 19100; 19100 / 255 = 74.9 which integer division truncates to 74. Integer division never rounds up, so 75 is wrong, and a long cannot print 74.9.",
        difficulty: 2
      },
      {
        type: "debug-code",
        prompt:
          "This L298N sketch should drive the left motor forward then in reverse, but in the 'reverse' step the motor just stops hard. Which line is the bug?",
        code: `const int ENA = 9, IN1 = 7, IN2 = 8;

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
}

void loop() {
  analogWrite(ENA, 200);
  digitalWrite(IN1, HIGH);   // forward
  digitalWrite(IN2, LOW);
  delay(1000);
  digitalWrite(IN1, HIGH);   // reverse
  digitalWrite(IN2, HIGH);
  delay(1000);
}`,
        options: [
          "analogWrite(ENA, 200); — ENA cannot take PWM",
          "delay(1000) is too short to reverse",
          "pinMode(ENA, OUTPUT); should be INPUT",
          "In the reverse step IN1 should be LOW (IN1=LOW, IN2=HIGH)"
        ],
        answerIndex: 3,
        explanation:
          "With IN1 and IN2 both HIGH the L298N brakes the motor (fast motor stop). Reverse needs IN1 LOW and IN2 HIGH. ENA on pin 9 accepts PWM to set speed, so that line is fine.",
        difficulty: 2
      }
    ]
  }),

  defineTopic("sumo", 12, {
    slug: "sumo-power-systems",
    title: "Power Systems",
    minutes: 12,
    summary: "Choosing and safely using Li-ion/LiPo batteries, regulators, switches and wiring so a sumo robot keeps full power through a stalled push.",
    introduction:
      "A sumo robot's power system must deliver high current during pushes while keeping the microcontroller alive and safe. That means choosing the right battery chemistry and cell count, understanding C-ratings, regulating logic power correctly and wiring everything with a common ground. It also means handling lithium batteries safely.",
    beginner:
      "The battery is the robot's fuel tank and its heart at the same time. If it cannot pump enough current when the motors push hard, the whole robot weakens — or the Arduino resets in the middle of a match.\n\nMost sumo robots use lithium batteries because they hold a lot of energy for their weight. A lithium-polymer (LiPo) cell is about 3.7 V nominal and 4.2 V when fully charged. Two cells in series (called 2S) give about 7.4 V nominal and 8.4 V full. Each pack also has a capacity in milliamp-hours (mAh) and a 'C' rating that tells you how much current it can safely deliver.\n\nMotors take power straight from the battery through the motor driver. The Arduino needs a steady 5 V, so the battery goes to its Vin pin (which has a regulator) or to a separate regulator — never straight into the 5V pin. All grounds must connect together so the signals make sense.\n\nLithium batteries can catch fire if they are damaged, over-charged or over-discharged. Always use a proper balance charger, never leave charging batteries unattended, and stop using any pack that becomes puffy.",
    technical: [
      {
        heading: "Battery chemistry, voltage and capacity",
        body:
          "- LiPo / Li-ion: about 3.7 V nominal (Li-ion often 3.6–3.7 V), 4.2 V full per cell. Avoid discharging below about 3.0–3.3 V per cell. 2S = 7.4 V nominal, 8.4 V full; 3S = 11.1 V nominal, 12.6 V full.\n- C-rating: maximum continuous current I_max = C × capacity (Ah). A 450 mAh 30C pack can supply 0.45 × 30 = 13.5 A.\n- Runtime estimate: t ≈ capacity / average current. A 450 mAh pack at an average of 1.5 A lasts about 0.3 h (18 min) — plenty for several rounds, but recharge between matches to keep voltage high.\n\nVoltage under load: V = E − I × R_internal. Old or cold packs have higher internal resistance and sag more."
      },
      {
        heading: "Regulating logic power",
        body:
          "- Arduino Uno/Nano Vin (or the Uno barrel jack): recommended 7–12 V; the onboard regulator produces 5 V. A 2S pack (7.4–8.4 V) suits Vin, although a heavily sagging pack can dip near the limit.\n- 5V pin: a regulated rail. Feeding it from an unregulated source above 5 V bypasses protection and can destroy the board.\n- A linear regulator dissipates P = (V_in − V_out) × I. From 8.4 V to 5 V at 0.2 A: P = 3.4 × 0.2 = 0.68 W of heat. A buck (switching) converter wastes far less.\n- ESP32 boards need 3.3 V logic; their onboard regulators accept 5 V on the 5V/VIN pin (check your specific board)."
      },
      {
        heading: "Wiring, switches and protection",
        body:
          "- Common ground: battery −, driver GND, microcontroller GND and sensor GND must all connect.\n- Main switch rated for the stall current of both motors combined.\n- Short, thick motor and battery wires reduce voltage drop.\n- A bulk electrolytic capacitor across the driver's motor supply (for example a few hundred µF) and small ceramic capacitors across motor terminals reduce voltage spikes and electrical noise that can reset the microcontroller.\n- Use connectors that cannot be plugged in reverse, and insulate all exposed battery terminals."
      },
      {
        heading: "Driver voltage drop",
        body:
          "Bipolar drivers like the L298N drop around 2 V at 1 A (more at higher current). From a fully charged 2S pack (8.4 V), the motors see roughly 6.4 V at 1 A. A MOSFET driver (TB6612FNG, DRV8833) drops only a small fraction of a volt at similar currents, so nearly the full battery voltage reaches the motors."
      }
    ],
    workingPrinciple:
      "Chemical energy in the cells becomes electrical energy at a voltage set by the chemistry and number of series cells. The motor branch draws large, rapidly changing currents directly from the pack through the driver; the logic branch draws small, steady currents through a regulator that holds 5 V (or 3.3 V) as long as its input stays high enough. A shared ground gives all signals a common reference, and capacitors smooth out spikes caused by motor switching.",
    diagrams: [
      {
        kind: "circuit",
        nodes: [
          { id: "bat", label: "2S LiPo 7.4 V", x: 40, y: 120 },
          { id: "sw", label: "Main switch", x: 160, y: 120 },
          { id: "cap", label: "Bulk capacitor", x: 280, y: 40 },
          { id: "drv", label: "Motor driver VM", x: 400, y: 40 },
          { id: "vin", label: "Arduino Vin", x: 400, y: 200 },
          { id: "gnd", label: "Common GND", x: 220, y: 280 }
        ],
        edges: [
          { from: "bat", to: "sw", label: "+", color: "red" },
          { from: "sw", to: "cap", color: "red" },
          { from: "cap", to: "drv", color: "red" },
          { from: "sw", to: "vin", color: "red" },
          { from: "bat", to: "gnd", label: "−", color: "black" },
          { from: "drv", to: "gnd", color: "black" },
          { from: "vin", to: "gnd", label: "Arduino GND", color: "black" }
        ]
      },
      {
        kind: "formula",
        latexish: "I_max = C × capacity(Ah),  V_load = E − I · R_int",
        legend: { I_max: "maximum continuous current (A)", C: "C-rating of the pack", E: "open-circuit voltage (V)", R_int: "internal resistance (Ω)" }
      }
    ],
    examples: [
      {
        title: "Battery voltage monitor with a divider",
        body:
          "A 10 kΩ (top) / 10 kΩ (bottom) divider halves the pack voltage so 8.4 V becomes 4.2 V, safely below the Uno's 5 V ADC reference. The code converts back to pack voltage and warns when a 2S pack falls below 6.6 V (3.3 V per cell).",
        code: `const int BATT_PIN = A2;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(BATT_PIN);           // 0..1023
  float vPin = raw * 5.0 / 1023.0;          // voltage at the pin
  float vPack = vPin * 2.0;                 // undo the 1:2 divider
  Serial.print("Pack V: ");
  Serial.println(vPack);
  if (vPack < 6.6) {
    Serial.println("LOW BATTERY - recharge");
  }
  delay(500);
}`
      },
      {
        title: "Sizing a pack",
        body:
          "A 4WD robot's four N20 motors stall at about 0.75 A each, so peak demand is roughly 3 A plus 0.1 A of logic. A 300 mAh 20C pack can supply 0.3 × 20 = 6 A continuously, giving a 2× margin. A 300 mAh 10C pack (3 A) would be marginal and would sag heavily during long pushes."
      }
    ],
    commonMistakes: [
      {
        mistake: "No common ground between battery, driver and Arduino",
        why: "Logic signals are voltages relative to ground; without a shared reference the driver sees random levels and motors behave erratically or not at all.",
        fix: "Connect battery −, driver GND and Arduino GND together."
      },
      {
        mistake: "Feeding battery voltage into the Arduino 5V pin",
        why: "The 5V pin bypasses the regulator; 7–8 V there can destroy the microcontroller and USB circuitry.",
        fix: "Use Vin (7–12 V recommended) or an external 5 V regulator."
      },
      {
        mistake: "Over-discharging or carelessly charging LiPo packs",
        why: "Cells damaged by over-discharge or over-charge can swell and catch fire.",
        fix: "Use a balance charger, a low-voltage alarm or monitor, never charge unattended, and retire puffy packs."
      }
    ],
    keyTakeaways: [
      "LiPo cells: 3.7 V nominal, 4.2 V full; 2S = 7.4 V nominal, 8.4 V full.",
      "Maximum current = C-rating × capacity in Ah.",
      "Power the Arduino through Vin or a regulator, never the 5V pin from the battery.",
      "All grounds must be common.",
      "L298N wastes about 2 V; MOSFET drivers pass nearly the full battery voltage."
    ],
    relatedComponents: ["LiPo 2S Battery", "18650 Li-ion Cell", "Arduino Uno R3", "L298N", "TB6612FNG", "LM2596 Buck Converter"],
    youtubeSearch: "LiPo battery basics C rating for robots safety",
    quiz: [
      {
        type: "predict-circuit",
        prompt:
          "A fully charged 2S LiPo (8.4 V) powers two motors through an L298N. Each motor channel draws about 1 A. Roughly what voltage reaches each motor?",
        options: ["About 8.4 V", "About 6.4 V", "About 4.2 V", "About 2 V"],
        answerIndex: 1,
        explanation:
          "The L298N's bipolar output stage drops around 2 V at 1 A, so the motors see about 8.4 − 2 = 6.4 V. Assuming the full 8.4 V is the common mistake; 2 V is the drop itself, not what reaches the motor.",
        difficulty: 2
      },
      {
        type: "calculate",
        prompt: "A 450 mAh LiPo pack is rated 30C. What is its maximum continuous discharge current?",
        options: [
          "13.5 A",
          "15 A",
          "0.45 A",
          "135 A"
        ],
        answerIndex: 0,
        explanation:
          "I_max = C × capacity in Ah = 30 × 0.45 = 13.5 A. 135 A comes from using 4.5 Ah instead of 0.45 Ah, and 0.45 A ignores the C-rating.",
        difficulty: 1
      },
      {
        type: "identify-pin",
        prompt: "Which Arduino Uno pin is intended for an unregulated 7–12 V input that passes through the onboard regulator?",
        options: ["5V", "3.3V", "Vin", "AREF"],
        answerIndex: 2,
        explanation:
          "Vin feeds the onboard regulator, so it accepts the recommended 7–12 V. The 5V pin is the regulated rail itself — feeding a battery there bypasses the regulator. AREF is the ADC reference input, not a power input.",
        difficulty: 1,
        diagram: { kind: "pinout", componentId: "arduino-uno-r3", highlight: ["VIN", "5V", "GND1"] }
      },
      {
        type: "find-wrong-connection",
        prompt:
          "The motors twitch randomly and do not follow commands. Which connection in this plan is wrong?\n\nA) Battery + → switch → driver VM\nB) Battery + → switch → Arduino Vin\nC) Battery − → driver GND only; Arduino GND left unconnected to it\nD) Arduino D5 → driver PWMA",
        options: ["A", "B", "C", "D"],
        answerIndex: 2,
        explanation:
          "Without a common ground, the Arduino's HIGH/LOW signals have no shared reference at the driver, so it reads unpredictable levels. Arduino GND must connect to battery − and driver GND. A, B and D are normal connections.",
        difficulty: 2
      },
      {
        type: "identify-driver",
        prompt:
          "Your robot moves to a 3S LiPo (12.6 V when full) with small motors drawing under 1 A. Which of these drivers is within its motor-supply voltage rating?",
        options: [
          "DRV8833 (2.7–10.8 V)",
          "TB6612FNG (VM up to 15 V)",
          "Both are fine",
          "Neither can be used"
        ],
        answerIndex: 1,
        explanation:
          "The TB6612FNG's VM rating (up to 15 V) covers 12.6 V. The DRV8833's maximum of 10.8 V is exceeded by a full 3S pack, so 'both are fine' is wrong.",
        difficulty: 2
      }
    ]
  }),

  defineTopic("sumo", 13, {
    slug: "sumo-ultrasonic-sensors",
    title: "Ultrasonic Sensors",
    minutes: 11,
    summary: "How the HC-SR04 measures distance with sound, how to read it reliably and quickly on an Arduino, and its limits in the sumo ring.",
    introduction:
      "The HC-SR04 ultrasonic sensor is the most common opponent detector for beginner sumo robots. It sends a burst of 40 kHz sound and times the echo. This topic explains the time-of-flight principle, the pin-level protocol, fast non-blocking reading with timeouts, and the situations where ultrasonic sensing fails in sumo.",
    beginner:
      "Shout towards a cliff and you hear an echo a moment later. If you knew how fast sound travels and timed the echo, you could work out how far away the cliff is. Bats use this trick to find insects in the dark. The HC-SR04 does exactly the same thing with a sound so high-pitched (40 kHz) that humans cannot hear it.\n\nThe sensor has two round 'eyes': one is a tiny speaker, the other a tiny microphone. When the Arduino asks for a measurement, the speaker sends a short chirp. When the echo bounces back from the opponent, the sensor tells the Arduino how long the round trip took. Sound travels about 343 metres per second, so the Arduino can turn that time into a distance.\n\nIn sumo, the sensor answers the question 'is the opponent in front of me, and how far?' It works from about 2 cm to 400 cm, more than enough for a 77 cm ring. But it is not perfect: sloped wedges can bounce the sound away so no echo returns, and each measurement takes time. Good code uses a timeout so the robot never waits too long for an echo that is not coming.",
    technical: [
      {
        heading: "Time of flight",
        body:
          "Distance d = v × t / 2, where v ≈ 343 m/s (air at about 20 °C) and t is the round-trip time. In convenient units: v ≈ 0.0343 cm/µs, so d(cm) = t(µs) × 0.0343 / 2 ≈ t / 58.\n\nWorked example: echo pulse 2320 µs ⇒ d ≈ 2320 / 58 = 40 cm. Check: 343 × 0.00232 / 2 ≈ 0.398 m.\n\nAcross a 77 cm ring the longest useful distance is under about 80 cm, so the echo is at most about 80 × 58 ≈ 4640 µs."
      },
      {
        heading: "HC-SR04 pin-level protocol",
        body:
          "Pins: VCC (5 V), Trig, Echo, GND.\n\n- Hold Trig LOW briefly, then HIGH for at least 10 µs, then LOW.\n- The module transmits an 8-cycle 40 kHz burst.\n- Echo goes HIGH and stays HIGH for a time equal to the round-trip travel time; pulseIn(ECHO, HIGH, timeout) measures it in microseconds and returns an unsigned long (0 on timeout).\n- Useful range about 2–400 cm, with a beam of roughly 15°. The datasheet suggests at least 60 ms between measurements so echoes from one ping do not confuse the next.\n- Echo is a 5 V signal. On a 3.3 V board such as the ESP32, use a resistor divider (for example 1 kΩ top, 2 kΩ bottom ⇒ 5 × 2/3 ≈ 3.33 V)."
      },
      {
        heading: "Fast, safe reading in a sumo loop",
        body:
          "pulseIn without a timeout waits up to one second by default — a disaster if no echo arrives. Pass a timeout matched to the ring: pulseIn(ECHO, HIGH, 6000UL) waits at most 6 ms (≈ 100 cm). Treat a 0 result as 'nothing seen'.\n\nStore durations in unsigned long. Dividing by 58 then fits easily in an int for ring distances.\n\nWith two or more ultrasonic sensors, fire them one at a time; simultaneous pings cause crosstalk where one sensor hears the other's chirp."
      },
      {
        heading: "Limitations in sumo",
        body:
          "- Angled surfaces (wedges) reflect sound away from the receiver, so a low wedge opponent may be invisible or detected late.\n- Soft or fabric surfaces absorb sound.\n- Below about 2 cm the reading is unreliable, which matters during contact.\n- Each reading takes milliseconds; many teams combine ultrasonic with faster IR distance sensors (Sharp GP2Y0A21YK0F, covered next) or use several sensors for side detection."
      }
    ],
    workingPrinciple:
      "A trigger pulse makes the module emit a short 40 kHz sound burst. The burst travels through air, reflects from a surface and returns to the receiver. The module raises Echo for the duration of that round trip. Because sound speed is roughly constant, the pulse width is proportional to distance; halving the round-trip time and multiplying by the speed of sound gives the distance to the target.",
    diagrams: [
      {
        kind: "pinout",
        componentId: "hc-sr04",
        highlight: ["TRIG", "ECHO"]
      },
      {
        kind: "signal",
        title: "HC-SR04 timing for a target at about 40 cm",
        series: [
          { label: "Trig", points: [[0, 0], [10, 0], [10, 1], [20, 1], [20, 0], [3000, 0]] },
          { label: "Echo", points: [[0, 0], [400, 0], [400, 1], [2720, 1], [2720, 0], [3000, 0]] }
        ],
        xLabel: "Time (µs, not to scale before Echo)",
        yLabel: "Logic level"
      }
    ],
    examples: [
      {
        title: "Reading distance with a ring-sized timeout",
        body:
          "Returns distance in cm, or 999 when no echo arrives within about 100 cm.",
        code: `const int TRIG = 9;
const int ECHO = 10;

int readCm() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long t = pulseIn(ECHO, HIGH, 6000UL);
  if (t == 0) return 999; // nothing within about 100 cm
  return t / 58;
}

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  Serial.begin(9600);
}

void loop() {
  int d = readCm();
  Serial.println(d);
  delay(60); // datasheet suggests 60 ms between pings
}`
      },
      {
        title: "Attack when the opponent is in the ring",
        body:
          "Because the ring is 77 cm across, any reading under about 70 cm is probably the opponent (or the far edge region). A simple rule: if d < 70, drive straight forward; otherwise keep searching. Tune the threshold on the real ring, and always check the edge sensors first."
      }
    ],
    commonMistakes: [
      {
        mistake: "Calling pulseIn without a timeout",
        why: "If no echo returns, the default timeout of one second freezes the robot's loop.",
        fix: "Use pulseIn(ECHO, HIGH, timeout) with a timeout matched to the ring size."
      },
      {
        mistake: "Declaring the Echo pin as OUTPUT",
        why: "The Arduino then drives the pin instead of listening; pulseIn never sees the echo pulse and returns 0.",
        fix: "pinMode(ECHO, INPUT); only Trig is an output."
      },
      {
        mistake: "Connecting Echo directly to a 3.3 V microcontroller",
        why: "Echo outputs 5 V, which exceeds the ESP32's 3.3 V input rating.",
        fix: "Use a resistor divider (1 kΩ / 2 kΩ) or a level shifter."
      }
    ],
    keyTakeaways: [
      "Distance = speed of sound × time / 2, about t(µs) / 58 in cm.",
      "Send a 10 µs Trig pulse, then measure the Echo HIGH time with pulseIn.",
      "Always use a timeout sized for the 77 cm ring.",
      "Store pulseIn results in unsigned long.",
      "Angled wedges can deflect sound; combine with IR sensors for reliability."
    ],
    relatedComponents: ["HC-SR04", "Arduino Uno R3", "ESP32 DevKit V1", "Sharp GP2Y0A21YK0F"],
    youtubeSearch: "HC-SR04 ultrasonic sensor Arduino pulseIn tutorial",
    quiz: [
      {
        type: "identify-pin",
        prompt: "Which HC-SR04 pin outputs a HIGH pulse whose width is proportional to the measured distance?",
        options: ["VCC", "Trig", "Echo", "GND"],
        answerIndex: 2,
        explanation:
          "Echo stays HIGH for the round-trip travel time of the sound. Trig is an input that you pulse for 10 µs to start a measurement — it does not report anything.",
        difficulty: 1,
        diagram: { kind: "pinout", componentId: "hc-sr04" }
      },
      {
        type: "code-output",
        prompt: "What does this code print?",
        code: `void setup() {
  Serial.begin(9600);
  unsigned long duration = 1000;
  int distance = duration / 58;
  Serial.println(distance);
}

void loop() {}`,
        options: [
          "17.24",
          "58",
          "34",
          "17"
        ],
        answerIndex: 3,
        explanation:
          "1000 / 58 = 17.24, but both operands are integer types, so the division truncates to 17 and the int prints as 17. 34 would come from forgetting that the /58 already includes halving the round trip.",
        difficulty: 1
      },
      {
        type: "debug-code",
        prompt: "This sensor always prints 0, even with a box 20 cm in front of it. What is the bug?",
        code: `const int TRIG = 9;
const int ECHO = 10;

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long t = pulseIn(ECHO, HIGH, 30000UL);
  Serial.println(t / 58);
  delay(60);
}`,
        options: [
          "delayMicroseconds(10) should be delay(10)",
          "pinMode(ECHO, OUTPUT) should be pinMode(ECHO, INPUT)",
          "t should be an int",
          "The timeout 30000UL is too short for 20 cm"
        ],
        answerIndex: 1,
        explanation:
          "Echo must be an input so the Arduino can measure the sensor's pulse. As an OUTPUT the pin is driven by the Arduino, pulseIn times out and returns 0. The 10 µs trigger is correct, and a 30 ms timeout is far longer than the ~1160 µs echo from 20 cm.",
        difficulty: 2
      },
      {
        type: "predict-circuit",
        prompt:
          "An HC-SR04 Echo pin (5 V HIGH) is connected to an ESP32 input through a divider: 1 kΩ from Echo to the pin, and 2 kΩ from the pin to GND. What voltage does the ESP32 pin see when Echo is HIGH?",
        options: ["About 1.67 V", "About 2.5 V", "About 3.33 V", "5 V"],
        answerIndex: 2,
        explanation:
          "V_out = 5 × 2k / (1k + 2k) = 3.33 V, a safe HIGH for a 3.3 V input. 1.67 V is what you would get with the resistors swapped (5 × 1k / 3k), which might not register as HIGH reliably.",
        difficulty: 2
      },
      {
        type: "calculate",
        prompt: "pulseIn returns an echo time of 2320 µs. Approximately how far away is the target?",
        options: ["20 cm", "40 cm", "80 cm", "134 cm"],
        answerIndex: 1,
        explanation:
          "d ≈ t / 58 = 2320 / 58 = 40 cm (equivalently 343 m/s × 0.00232 s / 2 ≈ 0.40 m). 80 cm forgets to halve the round trip.",
        difficulty: 1
      }
    ]
  })
];
