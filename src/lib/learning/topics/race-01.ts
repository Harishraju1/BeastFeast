import { defineTopic } from "../define";
import type { Topic } from "../types";

export const RACE_01: Topic[] = [
  defineTopic("race", 1, {
    slug: "intro-robot-racing",
    title: "Introduction to Robot Racing",
    minutes: 8,
    summary: "What a Robo Race car is, which subsystems it is built from, and how speed, control and reliability decide who wins.",
    introduction:
      "Robo Race is the event where a small electric robot car has to complete a track as fast as possible without leaving the course. Depending on the event the car is driven manually (wired or wireless remote) or runs autonomously. Either way, the winning robot is rarely the one with the fastest motors on paper: it is the one whose motors, wheels, battery, driver and control logic work together so the car is fast, stable and finishes every run.\n\nThis path takes you from the basic parts of a race car all the way to tuning lap times. In this first topic you will see the big picture and the few equations you will use again and again.",
    beginner:
      "Think of a robot race car like a relay team. The battery is the coach handing out energy. The microcontroller (an Arduino) is the captain who decides what to do. The motor driver is the strong teammate who takes the captain's quiet instructions and turns them into real muscle power. The motors and gearboxes are the legs, and the wheels and tyres are the shoes that grip the ground.\n\nIf any one teammate is weak, the whole team loses. Super-fast motors with slippery wheels just spin. A great motor with a tiny battery runs out of breath halfway round the track. A powerful car with a chassis that wobbles tips over in the first corner.\n\nSo building a race robot is really about balance. You choose motors that are fast enough but still strong enough to accelerate, wheels that grip, a battery that can deliver enough current, and a driver board that can handle that current without overheating. Then you practise on a track and improve one thing at a time. Every topic in this path zooms into one of those teammates so you understand exactly what it does and how to pick and tune it.",
    technical: [
      {
        heading: "The subsystems of a race car",
        body:
          "A typical club race car has six subsystems:\n\n- Chassis: the frame that holds everything and sets the wheelbase, track width and centre of gravity.\n- Drivetrain: four DC gear motors (TT/BO, N20 or larger), one per wheel, with gearboxes, wheels and tyres. The club standard is 4WD with skid steering and no caster.\n- Motor driver: an H-bridge board such as L298N, TB6612FNG or DRV8833 that switches battery current through the motors.\n- Power: a battery pack (often 2S Li-ion or LiPo, 7.4 V nominal), switch, wiring and sometimes a regulator for the logic.\n- Controller: an Arduino Uno/Nano or ESP32 that generates direction signals and PWM speed signals.\n- Command source: a wired controller, a wireless link (Bluetooth/Wi-Fi on an ESP32 or a Bluetooth module), or sensors for autonomous runs.\n\nThe signal flows one way (controller to driver to motors) and the energy flows from the battery through the driver to the motors.",
      },
      {
        heading: "The speed equation you will use everywhere",
        body:
          "A wheel of diameter D turning at N revolutions per minute moves the robot forward by one circumference (π·D) per revolution. So the linear speed is:\n\nv = π · D · N / 60   (v in m/s when D is in metres and N in RPM)\n\nWorked example: a 65 mm wheel (D = 0.065 m) on a motor turning at 200 RPM gives v = 3.1416 × 0.065 × 200 / 60 ≈ 0.68 m/s. A 3 m straight then takes about 3 / 0.68 ≈ 4.4 s at full speed, ignoring acceleration.\n\nReal lap time is always longer than distance / top speed because the car must accelerate from rest, slow down for corners and the motors run below their no-load RPM when loaded.",
      },
      {
        heading: "Manual versus autonomous racing",
        body:
          "In manual events the driver's skill matters and the electronics must respond instantly and predictably: the robot needs smooth speed control (PWM), reliable direction changes and a radio or cable link that does not drop out.\n\nIn autonomous events the robot must sense the track itself (for example with IR line sensors or distance sensors) and the control algorithm decides speed and steering. Either way the mechanical and electrical foundations in this path are identical: a car that cannot drive straight under manual control will not drive straight under software control either.",
      },
    ],
    workingPrinciple:
      "The Arduino sets two direction pins and one PWM pin per side of the car. The motor driver uses those logic-level signals to connect the battery to each motor in one polarity or the other, switching it on and off hundreds of times per second so the average voltage (and therefore speed) follows the PWM duty cycle. Each motor's gearbox trades speed for torque, the wheel converts rotation into forward motion through tyre grip, and steering comes from driving the left and right wheels at different speeds (differential steering).",
    diagrams: [
      { kind: "flow", steps: ["Battery pack (energy)", "Arduino (decisions: direction + PWM)", "Motor driver H-bridge (power switching)", "DC gear motors (torque)", "Wheels and tyres (grip and motion)"] },
      { kind: "formula", latexish: "v = π · D · N / 60", legend: { v: "linear speed (m/s)", D: "wheel diameter (m)", N: "wheel speed (RPM)", "60": "seconds per minute" } },
    ],
    examples: [
      {
        title: "First drive test with an L298N",
        body: "This sketch drives both sides forward at about 80% PWM for two seconds, then stops. ENA/ENB are on PWM pins 5 and 6; remove the ENA/ENB jumpers on the L298N so the Arduino controls speed. On the club's 4WD car the two left motors are wired in parallel on channel A and the two right motors on channel B, so this drives all four wheels.",
        code: `const int ENA = 5;
const int IN1 = 7;
const int IN2 = 8;
const int ENB = 6;
const int IN3 = 9;
const int IN4 = 10;

void setSide(int en, int a, int b, int speed) {
  if (speed >= 0) {
    digitalWrite(a, HIGH);
    digitalWrite(b, LOW);
  } else {
    digitalWrite(a, LOW);
    digitalWrite(b, HIGH);
    speed = -speed;
  }
  analogWrite(en, constrain(speed, 0, 255));
}

void setup() {
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  setSide(ENA, IN1, IN2, 204);
  setSide(ENB, IN3, IN4, 204);
  delay(2000);
  setSide(ENA, IN1, IN2, 0);
  setSide(ENB, IN3, IN4, 0);
}

void loop() {
}`,
      },
      {
        title: "Estimating a straight-line time",
        body: "Your track has a 2.4 m straight. Wheels are 43 mm and the motors turn at about 250 RPM under load. v = π × 0.043 × 250 / 60 ≈ 0.56 m/s, so the straight takes at least 2.4 / 0.56 ≈ 4.3 s. Switching to 65 mm wheels raises v to ≈ 0.85 m/s (≈ 2.8 s) but reduces the pushing force at the ground by the same ratio (43/65), so check the car can still accelerate and climb any ramps.",
      },
    ],
    commonMistakes: [
      { mistake: "Buying the highest-RPM motors first and designing around them.", why: "Top speed is useless if the car cannot accelerate, corner or stay on the track; very high RPM with little torque also stalls on bumps.", fix: "Start from the track: estimate needed speed and acceleration, then choose motor RPM, wheel size and gearing together." },
      { mistake: "Never testing on a realistic surface before competition day.", why: "Tyre grip, dust and joints in the track change traction and steering a lot.", fix: "Build a practice section with the same material as the competition track and test there weekly." },
      { mistake: "Treating the robot as finished once it moves.", why: "Loose wires, untightened wheels and weak batteries cause most race-day failures, not slow motors.", fix: "Keep a pre-run checklist: battery voltage, screws, connectors, wheel alignment, test drive." },
    ],
    keyTakeaways: [
      "A race car is a system: chassis, drivetrain, motor driver, power, controller and command source.",
      "Linear speed v = π·D·N/60 links wheel size and RPM to how fast you go.",
      "Energy flows battery → driver → motors; control signals flow Arduino → driver.",
      "Steering in most club race cars comes from different left/right wheel speeds.",
      "Reliability and grip often beat raw motor speed in real races.",
    ],
    relatedComponents: ["Arduino Uno R3", "L298N", "TB6612FNG", "BO Gear Motor", "18650 Li-ion Cell"],
    youtubeSearch: "robo race robot car competition build Arduino",
    quiz: [
      {
        type: "mcq",
        prompt: "Which formula gives the forward speed v (m/s) of a robot whose wheel of diameter D (m) turns at N RPM?",
        options: ["v = D · N / 60", "v = π · D · N / 60", "v = 2 · π · D · N", "v = π · D / (60 · N)"],
        answerIndex: 1,
        explanation: "One wheel revolution moves the robot one circumference, π·D. N revolutions per minute is N/60 per second, so v = π·D·N/60. Forgetting π (v = D·N/60) treats the diameter as if it were the distance per turn, which underestimates speed by about 3.14×.",
        difficulty: 1,
      },
      {
        type: "identify-component",
        prompt: "Which component takes the Arduino's low-current direction and PWM signals and switches the high battery current through the motors?",
        options: ["HC-SR04", "7805 voltage regulator", "TCRT5000", "L298N motor driver"],
        answerIndex: 3,
        explanation: "An H-bridge motor driver such as the L298N switches the battery current through the motor in either direction under logic control. A 7805 regulator only produces a steady 5 V for logic and cannot reverse or switch motor current; HC-SR04 and TCRT5000 are sensors.",
        difficulty: 1,
      },
      {
        type: "predict-movement",
        prompt: "Both sides of a 2WD car are commanded 'forward' with the same PWM value, but the right motor's two wires were swapped at the driver's output terminals. Seen from above, what does the car do?",
        options: ["Drives straight forward", "Drives straight backward", "Spins on the spot clockwise (turning right)", "Spins on the spot anticlockwise (turning left)"],
        answerIndex: 2,
        explanation: "Swapping a motor's wires reverses only that motor. The left wheel pushes forward while the right wheel pushes backward at the same speed, so the car rotates about its centre towards the right (clockwise from above). It does not drive straight, because the two sides now oppose each other.",
        difficulty: 2,
      },
      {
        type: "debug-code",
        prompt: "This sketch is meant to drive forward for 2 seconds and then stop, but the robot keeps driving until the battery is unplugged. What is the fix?",
        code: `void setup() {
  pinMode(5, OUTPUT);
  pinMode(7, OUTPUT);
  pinMode(8, OUTPUT);
  digitalWrite(7, HIGH);
  digitalWrite(8, LOW);
  analogWrite(5, 200);
  delay(2000);
}

void loop() {
}`,
        options: ["Add analogWrite(5, 0); after delay(2000);", "Change pin 5 to a PWM pin such as pin 4", "Move everything into loop() because delay() does not work in setup()", "Add delay(2000); inside loop()"],
        answerIndex: 0,
        explanation: "Nothing ever turns the enable PWM off, so the driver keeps powering the motor after the delay. Writing analogWrite(5, 0) (or setting both IN pins equal) stops it. Pin 5 already is a PWM pin, and delay() works fine in setup(); moving the code into loop() would make it repeat forever instead of stopping.",
        difficulty: 1,
      },
    ],
  }),

  defineTopic("race", 2, {
    slug: "competition-rules",
    title: "Competition Rules",
    minutes: 7,
    summary: "The typical rule categories in robot racing and why your club's own rulebook always has the final word.",
    introduction:
      "Every robot race is run under a rulebook. Rules decide how big and heavy the robot may be, how it is controlled, what power source is allowed, what counts as leaving the track, how restarts work and how time is measured. Designing without reading the rules is the fastest way to be disqualified at inspection.\n\nImportant: the rule examples in this topic are typical categories seen at many events. The Beast Feast club's own rulebook, set and updated by the club administrators, always takes precedence over anything written here or found online.",
    beginner:
      "Rules in a robot race are like the rules of a football match. Everyone has to use a ball of the same size, play on the same pitch and stop when the referee blows the whistle. Without that, the game would not be fair and nobody could compare teams.\n\nIn robot racing the 'ball size' rules are the maximum length, width, height and weight of your robot. The 'pitch' rules say where the track edges are and what happens if your robot crosses them. The 'referee' rules cover how a run starts, how time is measured, whether you may touch the robot during the run and how many attempts you get.\n\nSome rules exist for safety, such as limits on battery voltage, a rule that the robot must have an easy power switch, or a ban on anything that damages the track. Others exist for fairness, such as banning off-the-shelf ready-made RC cars.\n\nRead the rules before you buy parts. A robot that is 1 cm too wide or uses a forbidden battery has to be fixed before it can race, sometimes in a panic on competition day.",
    technical: [
      {
        heading: "Typical rule categories",
        body:
          "- Dimensions: maximum length × width × height, usually checked by placing the robot in a box or frame. Anything that sticks out (wheels, wires, antennas) counts.\n- Weight: a maximum mass, checked on a scale with the battery fitted.\n- Control mode: autonomous only, wired remote, or wireless remote, depending on the event. Wired events may also limit cable length.\n- Power: often a maximum battery voltage and sometimes a ban on certain power sources; the robot must have an accessible power switch.\n- Track: the boundary of the track, checkpoints or obstacles, and what counts as leaving the track.\n- Run procedure: start signal, number of attempts, restarts, hand touches (picking the robot up) and the penalty for each.\n- Timing: what is timed (single lap, best of N runs, total of several laps) and how ties are broken.\n- Safety and fairness: no damage to the track, no ready-made commercial cars, inspection before racing.",
      },
      {
        heading: "Designing to the limits with margin",
        body:
          "Treat every numerical limit as a design input with a safety margin. Example only: if a rule allowed a 25 cm × 20 cm footprint, a sensible target would be about 24 cm × 19 cm so tolerances in cutting, tyre bulge and cable routing never push you over.\n\nRemember that the outer edge of the tyres sets the width: overall width = chassis width + 2 × (wheel overhang beyond the chassis). Weigh the robot with the battery you will race with; a 2S 18650 pack plus holder adds roughly 100 g, which matters if the weight limit is tight.\n\nVoltage limits usually refer to the battery's nominal or maximum voltage. A fully charged 2S Li-ion or LiPo pack reaches 8.4 V even though it is labelled 7.4 V, so check which value your rulebook means.",
      },
      {
        heading: "Rule precedence",
        body:
          "Rules differ between competitions and change from year to year. When two sources disagree, the order of precedence for Beast Feast events is:\n\n- 1st: the current club rulebook published by the administrators;\n- 2nd: clarifications given by the judges on the day;\n- 3rd: anything else (other competitions, videos, this academy).\n\nIf a rule is unclear, ask the organisers in writing before you build, not at inspection.",
      },
    ],
    workingPrinciple:
      "A rulebook turns a creative build into a fair contest by fixing the constraints every team shares: size, mass, power, control method and scoring. Engineers treat each rule as a requirement, design to it with margin, and verify compliance before inspection, exactly as real engineering projects verify a product against a specification.",
    diagrams: [
      { kind: "flow", steps: ["Read the club rulebook (administrators' latest version)", "List every numeric limit as a design requirement", "Design with margin (size, weight, voltage)", "Self-inspect: measure, weigh, check switch and wiring", "Official inspection", "Race runs under judges' timing and penalties"] },
    ],
    examples: [
      {
        title: "A pre-inspection checklist",
        body: "- Measure length, width and height including tyres and protruding wires.\n- Weigh the robot with the race battery fitted.\n- Check the battery's maximum charged voltage against the voltage rule.\n- Confirm the power switch is easy to reach and clearly marked.\n- Confirm the control mode (autonomous/wired/wireless) matches the event.\n- Carry a printed copy of the club rulebook in your toolbox.",
      },
      {
        title: "Checking a width rule (example values)",
        body: "Example rule: maximum width 20 cm. Your chassis plate is 17 cm wide and each wheel sticks out 1.2 cm beyond the plate. Overall width = 17 + 2 × 1.2 = 19.4 cm, leaving 0.6 cm margin. If you change to wider tyres that stick out 1.8 cm, width becomes 20.6 cm and the robot fails inspection.",
      },
    ],
    commonMistakes: [
      { mistake: "Building from a rulebook found online instead of the club's current rules.", why: "Different events have different limits; the club rulebook is the one the judges apply.", fix: "Download the latest club rulebook from the administrators before buying parts and re-check before each event." },
      { mistake: "Measuring the chassis instead of the whole robot.", why: "Wheels, bumpers and loose cables count towards the size limit.", fix: "Measure the extreme points of the complete robot, or build a cardboard test box of the allowed size." },
      { mistake: "Reading the battery's nominal voltage against a maximum-voltage rule.", why: "A 7.4 V nominal 2S pack is 8.4 V when fully charged.", fix: "Confirm with the organisers whether the limit is nominal or maximum, and choose the pack accordingly." },
    ],
    keyTakeaways: [
      "Rules typically cover size, weight, control mode, power, track boundaries, run procedure, timing and safety.",
      "The club's own rulebook set by the administrators always takes precedence.",
      "Design to every limit with a margin and measure the complete robot.",
      "Know the restart and hand-touch penalties: they can decide close races.",
      "Ask unclear rule questions in writing before building.",
    ],
    relatedComponents: ["Arduino Uno R3", "18650 Li-ion Cell", "Rocker Switch"],
    youtubeSearch: "robo race competition rules robot inspection",
    quiz: [
      {
        type: "mcq",
        prompt: "A rule you read on another competition's website conflicts with the Beast Feast club rulebook. Which one applies at a Beast Feast event?",
        options: ["The stricter of the two", "The other competition's rule, because it is more widely used", "The club rulebook set by the administrators", "Whichever rule your team prefers"],
        answerIndex: 2,
        explanation: "The club's own rulebook, published by its administrators, takes precedence at club events. Being 'stricter' or 'more popular' does not make another event's rule binding, and teams cannot pick rules for themselves.",
        difficulty: 1,
      },
      {
        type: "calculate",
        prompt: "Example rule: maximum robot width 20 cm. Your chassis plate is 18 cm wide and each wheel sticks out 1.5 cm beyond the plate on its side. Does the robot pass?",
        options: ["Yes, with 1 cm to spare", "No, it is 1 cm too wide", "No, it is 3 cm too wide", "Yes, it is exactly 20 cm"],
        answerIndex: 1,
        explanation: "Overall width = 18 + 2 × 1.5 = 21 cm, which is 1 cm over the 20 cm limit. The common mistake is adding the overhang only once (18 + 1.5 = 19.5 cm) or measuring only the plate.",
        difficulty: 1,
      },
      {
        type: "mcq",
        prompt: "Why do many race rulebooks set a maximum battery voltage?",
        options: ["To make every robot exactly the same speed", "Because motor drivers cannot work above 5 V", "Because higher voltage always reduces battery life to zero", "To keep the contest fair and safe by limiting available power"],
        answerIndex: 3,
        explanation: "Motor power rises with supply voltage, so a voltage cap keeps power levels comparable and reduces battery and fire risk. It does not make robots identical (gearing, grip and control still differ), and drivers such as the L298N run far above 5 V.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt: "A rule limits battery voltage to 'maximum 8.4 V'. Which pack meets it with no margin to spare when fully charged?",
        options: ["1S LiPo (3.7 V nominal)", "2S Li-ion (7.4 V nominal)", "3S LiPo (11.1 V nominal)", "Two 9 V PP3 batteries in series"],
        answerIndex: 1,
        explanation: "A 2S lithium pack is 7.4 V nominal but 2 × 4.2 = 8.4 V fully charged, exactly at the limit. A 1S pack is well below, and 3S (12.6 V full) or 18 V from two PP3s are over the limit. Comparing only nominal values is the classic error.",
        difficulty: 2,
      },
    ],
  }),

  defineTopic("race", 3, {
    slug: "chassis-design",
    title: "Chassis Design",
    minutes: 9,
    summary: "How chassis material, stiffness, wheelbase, track width and layout shape a race car's speed, stability and reliability.",
    introduction:
      "The chassis is the skeleton of the race car. It fixes where the motors, wheels, battery and electronics sit, and therefore decides the robot's weight, stiffness, wheelbase, track width and centre of gravity. A good chassis is light, stiff, easy to repair and keeps heavy parts low and central.",
    beginner:
      "Imagine running while wearing a backpack. If the bag is light and pulled tight against your back you can sprint and turn easily. If it is heavy and swinging around, you wobble, slow down and might fall in a sharp turn. A robot chassis is the frame that carries the robot's 'backpack' of battery, boards and motors.\n\nA good chassis does four jobs. First, it is stiff: when the motors push, the frame should not bend, otherwise wheels point in the wrong direction. Second, it is light, because every extra gram needs extra force to accelerate. Third, it keeps the heavy battery low and near the middle so the car is stable in corners. Fourth, it is practical: you can reach the battery, switch and USB port without taking everything apart.\n\nClub robots often use acrylic sheet, plywood, aluminium, 3D-printed plastic or even a printed circuit board as the chassis. Each has trade-offs in weight, strength and how easy it is to cut and drill. The best design is usually the simplest one that is stiff enough and puts the wheels exactly where you planned.",
    technical: [
      {
        heading: "Mass and acceleration",
        body:
          "Newton's second law sets the basic trade-off: a = F / m. If the drive wheels can push with a total force of 3 N, a 0.6 kg robot accelerates at 5 m/s² while a 0.4 kg robot reaches 7.5 m/s². Removing 200 g therefore improves acceleration by 50% without touching the motors.\n\nWhere to save mass: thinner plates with ribs instead of thick solid plates, short wires, a battery sized for the race (not the largest available) and no unused brackets.",
      },
      {
        heading: "Wheelbase, track width and tipping",
        body:
          "Wheelbase (L) is the distance between front and rear axles; track width (T) is the distance between left and right wheel centres.\n\n- Longer wheelbase: more stable in a straight line, slower to rotate.\n- Wider track: more resistant to tipping in corners, but must fit the size rule.\n\nA simple tipping check for a robot with centre of gravity height h: the robot tips sideways when lateral acceleration exceeds a_tip = g · (T/2) / h. Example: T = 14 cm, h = 4 cm gives a_tip = 9.81 × 7 / 4 ≈ 17 m/s², far above what rubber tyres can grip, so this robot will slide before it tips. With h = 10 cm, a_tip ≈ 6.9 m/s², and tipping in fast corners becomes possible.",
      },
      {
        heading: "Materials and stiffness",
        body:
          "- Acrylic: easy to laser-cut, but brittle and cracks around tight screw holes.\n- Plywood/MDF: cheap and easy to drill, absorbs vibration, heavier for the same stiffness.\n- Aluminium sheet or extrusion: stiff and tough, needs metal tools.\n- 3D-printed PLA/PETG: any shape, add ribs for stiffness; avoid thin flat plates.\n- FR4 PCB chassis: very stiff and light when the electronics are the chassis.\n\nA plate's bending stiffness grows with the cube of its thickness, so a 3 mm plate is about 3.4× stiffer than a 2 mm plate of the same material (1.5³ ≈ 3.4). Folding an edge or adding a rib increases stiffness far more cheaply than making the whole plate thicker.",
      },
      {
        heading: "Layout rules of thumb",
        body:
          "- Mount all four motors with proper brackets so the front pair and the rear pair each sit on one straight axle line; misaligned motors make the car pull to one side.\n- Place the battery low and between the axles.\n- Keep the motor driver near the motors (short high-current wires) and the Arduino where its USB port is reachable.\n- Use standoffs to stack a second deck rather than gluing boards on top of each other.\n- Leave access to the power switch and battery connector without tools.",
      },
    ],
    workingPrinciple:
      "The chassis transfers the motor reaction forces to the wheels and carries every component's weight. Its stiffness keeps wheel alignment constant under load, its mass sets how much force is needed to accelerate (a = F/m), and its geometry (wheelbase, track width, height of the heavy parts) decides how the robot responds in corners and whether it slides or tips.",
    diagrams: [
      { kind: "formula", latexish: "a_tip = g · (T / 2) / h", legend: { a_tip: "lateral acceleration at which the robot tips (m/s²)", g: "9.81 m/s²", T: "track width (m)", h: "height of centre of gravity (m)" } },
      { kind: "circuit", nodes: [ { id: "fl", label: "FL motor + wheel", x: 10, y: 20 }, { id: "fr", label: "FR motor + wheel", x: 90, y: 20 }, { id: "rl", label: "RL motor + wheel", x: 10, y: 80 }, { id: "rr", label: "RR motor + wheel", x: 90, y: 80 }, { id: "mcu", label: "Arduino (top deck)", x: 50, y: 0 }, { id: "drv", label: "Motor driver", x: 50, y: 35 }, { id: "bat", label: "Battery (low, mid)", x: 50, y: 70 } ], edges: [ { from: "bat", to: "drv", label: "power", color: "red" }, { from: "mcu", to: "drv", label: "IN/EN signals" }, { from: "drv", to: "fl", label: "ch A (left pair)" }, { from: "drv", to: "rl", label: "ch A (left pair)" }, { from: "drv", to: "fr", label: "ch B (right pair)" }, { from: "drv", to: "rr", label: "ch B (right pair)" } ] },
    ],
    examples: [
      {
        title: "Weight budget for a 4WD race car",
        body: "Example budget for the club's 4WD layout: 4 × N20 gear motors with brackets ≈ 60 g, four wheels ≈ 60 g, Arduino Nano ≈ 7 g, TB6612FNG module ≈ 3 g, 2S 18650 pack in holder ≈ 100 g, chassis plate ≈ 40 g, wires/screws ≈ 30 g: total ≈ 300 g. There is no caster: all four wheels are driven, and the left pair and right pair each share one driver channel. Writing the budget down before building shows that the battery is the biggest single mass, so its position matters most for balance.",
      },
      {
        title: "Checking a design for tipping",
        body: "Your robot has track width 12 cm and you estimate the centre of gravity is 3 cm above the ground. a_tip = 9.81 × 0.06 / 0.03 ≈ 19.6 m/s². Because realistic tyre grip limits cornering to well below this, the robot will skid rather than roll over. If you later stack two decks and raise the CG to 8 cm, a_tip drops to ≈ 7.4 m/s², so keep the battery on the lower deck.",
      },
    ],
    commonMistakes: [
      { mistake: "Using thin acrylic with screws tightened hard near the edge.", why: "Acrylic is brittle and cracks from stress around holes, often during a run.", fix: "Keep holes at least a few millimetres from edges, use washers and do not over-tighten; or switch to plywood/aluminium for the base." },
      { mistake: "Mounting the battery on the top deck because it is easy.", why: "A high battery raises the centre of gravity and reduces the tipping limit.", fix: "Put the battery on the lowest deck, between the axles, held by a strap or holder." },
      { mistake: "Gluing motors directly to the chassis without alignment.", why: "Slightly angled motors make the wheels toe in or out, so the car pulls to one side and scrubs speed.", fix: "Use motor brackets with a straight reference edge and check both axles line up with a ruler." },
    ],
    keyTakeaways: [
      "a = F/m: every gram removed improves acceleration with the same motors.",
      "Wider track and lower centre of gravity raise the tipping limit a_tip = g·(T/2)/h.",
      "Stiffness keeps wheels aligned; ribs and folds add stiffness cheaply.",
      "Put the heaviest part (battery) low and central.",
      "Design for maintenance: reachable switch, battery and USB port.",
    ],
    relatedComponents: ["N20 Micro Metal Gear Motor", "BO Gear Motor", "Motor Mounting Brackets", "18650 Li-ion Cell", "Arduino Nano"],
    youtubeSearch: "robot car chassis design tips low center of gravity",
    quiz: [
      {
        type: "identify-component",
        prompt: "A 2WD race chassis has a small free-rolling metal sphere in a plastic housing at the front instead of two front wheels. What is this part?",
        options: ["Wheel encoder", "Ball caster", "Gearbox", "Motor bracket"],
        answerIndex: 1,
        explanation: "A ball caster is a sphere that rolls freely in any direction, supporting the chassis without steering it. It is not an encoder (which measures rotation) or a gearbox (which changes speed and torque); a motor bracket only holds the motor.",
        difficulty: 1,
      },
      {
        type: "calculate",
        prompt: "The drive wheels of a 0.5 kg robot can push with a total force of 2 N. Ignoring friction losses, what is its acceleration?",
        options: ["0.25 m/s²", "1 m/s²", "4 m/s²", "10 m/s²"],
        answerIndex: 2,
        explanation: "a = F / m = 2 N / 0.5 kg = 4 m/s². Multiplying instead of dividing (2 × 0.5 = 1) is the common slip; the units only work out as N/kg = m/s².",
        difficulty: 1,
      },
      {
        type: "predict-movement",
        prompt: "The chassis of a 4-wheel car is slightly twisted, so on a bumpy section the front-LEFT driven wheel lifts off the track while the other wheels keep normal contact and all motors run at equal speed. What happens while the wheel is lifted?",
        options: ["The car pulls to the left", "The car pulls to the right", "The car continues perfectly straight", "The car stops"],
        answerIndex: 0,
        explanation: "The lifted wheel produces no driving force, so the right side pushes harder than the left. Extra force on the right makes the car yaw towards the left. It does not stop, because the remaining wheels still drive, and it cannot stay perfectly straight with unbalanced forces.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt: "Keeping material the same, roughly how much stiffer in bending is a 3 mm chassis plate than a 2 mm plate?",
        options: ["1.5 times", "2.25 times", "About 3.4 times", "9 times"],
        answerIndex: 2,
        explanation: "Bending stiffness scales with thickness cubed: (3/2)³ = 3.375 ≈ 3.4. 1.5× would be a linear assumption and 2.25× is the square, both underestimate the effect of thickness.",
        difficulty: 3,
      },
    ],
  }),
];
