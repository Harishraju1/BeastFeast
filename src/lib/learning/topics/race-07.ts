import { defineTopic } from "../define";
import type { Topic } from "../types";

export const RACE_07: Topic[] = [
  defineTopic("race", 7, {
    slug: "torque",
    title: "Torque",
    minutes: 9,
    summary: "What torque is, how it becomes pushing force at the wheel, and how to estimate how much your race car needs.",
    introduction:
      "Speed tells you how fast a wheel turns; torque tells you how hard it can twist. A race car needs enough torque to accelerate quickly, climb ramps and push through bumps without stalling. In this topic you will connect torque to wheel force and power, convert between the units printed on motor listings, and size a motor for a target acceleration.",
    beginner:
      "Torque is a twisting push. Think about opening a heavy door. Push near the hinges and it barely moves; push at the handle, far from the hinges, and it swings open easily. The force is the same, but the twisting effect, the torque, is bigger when you push further from the pivot. Torque = force × distance.\n\nA robot wheel works the other way round. The motor twists the axle with a certain torque, and the tyre pushes on the ground at a distance equal to the wheel's radius. A small wheel turns that torque into a big push; a big wheel turns the same torque into a smaller push but covers more ground each turn.\n\nIf the torque is too low, the robot accelerates slowly, struggles on ramps and may stall when a wheel hits a bump. Too much torque with too little speed makes a robot that pulls hard but never gets fast. Gearboxes let you trade one for the other. So race engineers think of torque and speed together, always asking: is there enough push to get up to speed quickly, and enough speed once we are moving?",
    technical: [
      {
        heading: "Torque, force and radius",
        body:
          "Torque is τ = F · r. At the wheel, the pushing force on the ground is F = τ / r, where r is the wheel radius.\n\nUnits: SI torque is the newton-metre (N·m). Hobby listings often use kg·cm (more precisely kgf·cm): 1 kg·cm = 0.0981 N·m ≈ 0.1 N·m.\n\nExample: a gear motor with 1.5 kg·cm of torque on a wheel of radius 3 cm can push with 1.5 / 3 = 0.5 kgf ≈ 4.9 N at the ground (before losses).",
      },
      {
        heading: "Power links torque and speed",
        body:
          "Mechanical power P = τ · ω, with ω in rad/s (ω = 2π · RPM / 60).\n\nExample: 0.15 N·m at 200 RPM: ω = 20.9 rad/s, so P ≈ 3.1 W. Because a DC motor's torque falls linearly as speed rises, power is zero at stall and at no load and peaks in the middle. A gearbox can trade speed for torque, but it cannot create power: output power is always input power times efficiency.",
      },
      {
        heading: "How much torque does the car need?",
        body:
          "Required total wheel force F = m · a + F_rolling (+ m · g · sin θ on a ramp of angle θ). Divide by the number of driven motors and multiply by wheel radius.\n\nWorked example: m = 0.8 kg, target a = 2 m/s², two driven wheels of radius 0.0325 m. F = 0.8 × 2 = 1.6 N total, 0.8 N per wheel, τ = 0.8 × 0.0325 ≈ 0.026 N·m ≈ 0.27 kg·cm per motor. Add a margin of 2–3× for rolling resistance, gear losses, battery sag and ramps, so choose motors that can deliver roughly 0.6–0.8 kg·cm while still moving (not just at stall).\n\nTorque is only useful up to the traction limit: if τ / r exceeds μ · N on that wheel, the tyre spins.",
      },
    ],
    workingPrinciple:
      "Current through the motor windings produces torque proportional to that current (τ = kₜ·I). The gearbox multiplies torque by its ratio (minus losses), and the wheel converts axle torque into a ground force F = τ/r. That force accelerates the robot's mass (F = m·a) as long as it stays below the tyre's friction limit μ·N.",
    diagrams: [
      { kind: "formula", latexish: "F = τ / r ;  P = τ · ω", legend: { F: "force at the ground (N)", "τ": "wheel torque (N·m)", r: "wheel radius (m)", P: "mechanical power (W)", "ω": "angular speed (rad/s)" } },
      { kind: "flow", steps: ["Choose target acceleration a and robot mass m", "Total force F = m·a (+ ramp and rolling losses)", "Force per driven wheel = F / n", "Torque per motor τ = (F/n) · r", "Apply 2–3× margin and check against the motor's loaded torque", "Check τ/r stays below tyre grip μ·N"] },
    ],
    examples: [
      {
        title: "Converting a motor listing",
        body: "A listing says 'stall torque 2.0 kg·cm'. In SI: 2.0 × 0.0981 ≈ 0.196 N·m. Remember stall torque is the maximum at zero speed. For continuous driving plan to use well under half of it, otherwise the motor runs slowly, hot and inefficiently.",
      },
      {
        title: "Ramp check",
        body: "A 0.6 kg car must climb a 15° ramp. The force needed just to hold position is m·g·sin θ = 0.6 × 9.81 × 0.259 ≈ 1.52 N. With two driven 65 mm wheels (r = 0.0325 m) each motor must supply at least 0.76 × 0.0325 ≈ 0.025 N·m (≈ 0.25 kg·cm) just to hold the car on the ramp; accelerating up it needs more.",
      },
    ],
    commonMistakes: [
      { mistake: "Designing with the stall torque value.", why: "Stall torque only exists at zero speed; at useful speeds the motor delivers much less.", fix: "Size for the torque needed while moving and keep it well below stall torque." },
      { mistake: "Mixing kg·cm and N·m in one calculation.", why: "1 kg·cm is about 0.098 N·m, so mixing them creates a 10× error.", fix: "Convert everything to SI (N, m, N·m) before calculating." },
      { mistake: "Assuming more torque always means faster acceleration.", why: "Above the traction limit μ·N the wheel just spins.", fix: "Compare τ/r with μ·N per wheel; improve tyres or weight distribution if torque already exceeds grip." },
    ],
    keyTakeaways: [
      "Torque τ = F·r; ground force F = τ/r.",
      "1 kg·cm ≈ 0.098 N·m.",
      "P = τ·ω: gearing trades torque for speed but never adds power.",
      "Required torque per motor = (m·a + losses)/n × r, plus a safety margin.",
      "Useful torque is capped by tyre grip.",
    ],
    relatedComponents: ["N20 Micro Metal Gear Motor", "BO Gear Motor", "TT Yellow Gear Motor", "L298N"],
    youtubeSearch: "motor torque explained robot wheel force kg cm",
    quiz: [
      {
        type: "calculate",
        prompt: "A gear motor delivers 1.5 kg·cm of torque to a wheel with a 3 cm radius. What force does the tyre push with at the ground (ignoring losses)?",
        options: ["0.5 kgf (≈ 4.9 N)", "4.5 kgf (≈ 44 N)", "2.0 kgf (≈ 19.6 N)", "0.05 kgf (≈ 0.49 N)"],
        answerIndex: 0,
        explanation: "F = τ / r = 1.5 kg·cm / 3 cm = 0.5 kgf ≈ 4.9 N. Multiplying torque by radius (4.5) is the common mistake: force is torque divided by the lever arm.",
        difficulty: 2,
      },
      {
        type: "predict-movement",
        prompt: "A race car uses very high-RPM, low-torque motors with large wheels. It is fast on the flat. What most likely happens when it reaches a steep ramp?",
        options: ["It climbs faster than on the flat", "It slows sharply and may stall", "It flips backwards immediately", "It turns left"],
        answerIndex: 1,
        explanation: "On a ramp the motors must also lift the robot (m·g·sin θ). With little torque and large wheels (low F = τ/r), the motors are pushed towards stall, so speed drops sharply. Flipping requires a very high CG and big torque, the opposite of this design.",
        difficulty: 1,
      },
      {
        type: "mcq",
        prompt: "At which operating point(s) does a brushed DC motor deliver zero mechanical power?",
        options: ["Only at stall", "Only at no load", "At half stall torque", "At both stall and no load"],
        answerIndex: 3,
        explanation: "P = τ·ω. At stall ω = 0; at no load τ ≈ 0. In both cases the product is zero. At half stall torque the motor delivers its MAXIMUM power, not zero.",
        difficulty: 2,
      },
      {
        type: "identify-component",
        prompt: "Which part of a 'gear motor' multiplies the motor's small torque so the wheel can push the robot?",
        options: ["The commutator", "The gearbox", "The motor driver", "The encoder"],
        answerIndex: 1,
        explanation: "The gearbox reduces speed and multiplies torque by its ratio (minus friction losses). The commutator only switches current inside the motor, the driver supplies electrical power, and the encoder measures rotation.",
        difficulty: 1,
      },
    ],
  }),

  defineTopic("race", 8, {
    slug: "gear-ratios",
    title: "Gear Ratios",
    minutes: 9,
    summary: "How gear ratios trade speed for torque, how to calculate multi-stage ratios, and how to pick a ratio for a race track.",
    introduction:
      "A bare DC motor spins far too fast and with too little torque to drive a wheel directly. Gearboxes fix that by reducing speed and multiplying torque. The gear ratio is the single most powerful tuning knob on a race car: it decides top speed, acceleration and how hard the motor works.",
    beginner:
      "Think of the gears on a bicycle. In a low gear, pedalling is easy and you can climb hills, but even pedalling fast you do not go very fast. In a high gear, every push is harder but each turn of the pedals moves you much further. The bicycle chain and sprockets trade 'easy to push' against 'distance per pedal turn'.\n\nA robot gearbox does the same between the motor and the wheel. A small gear on the motor drives a big gear on the wheel axle. Because the big gear has more teeth, it turns more slowly, but it twists with more force. If the small gear has 10 teeth and the big gear has 30, the wheel turns three times slower and with about three times the torque, minus some loss to friction.\n\nFor racing you choose the ratio like choosing a bicycle gear for a course. A track with long straights rewards a higher speed (lower reduction); a twisty or hilly track rewards more torque (higher reduction) so the car accelerates out of every corner. The motor itself stays the same; only the trade-off changes.",
    technical: [
      {
        heading: "Ratio definitions",
        body:
          "For two meshing gears, ratio i = N_driven / N_driver (teeth counts). Output speed = input speed / i. Output torque = input torque × i × η, where η is gearbox efficiency.\n\nExample: a 12-tooth pinion on a 6000 RPM motor driving a 36-tooth gear: i = 3, output = 2000 RPM, torque ×3 (before losses). Each pair of meshing external gears also reverses the rotation direction.",
      },
      {
        heading: "Multi-stage gearboxes",
        body:
          "Stages multiply: i_total = i₁ × i₂ × i₃ ... A two-stage box with 10:30 and 10:40 has i = 3 × 4 = 12. The widely used yellow TT motor gearbox is commonly sold as 1:48, built from several stages.\n\nEfficiency also multiplies: two stages that each lose some energy to friction combine to a lower overall efficiency. Plastic spur gearboxes lose noticeably more than precision metal ones. Example calculation: input 0.01 N·m, i = 12, η = 0.8 gives 0.01 × 12 × 0.8 = 0.096 N·m at the output.",
      },
      {
        heading: "Choosing a ratio for the race",
        body:
          "Top speed (no load) v_max = π · D · (N_motor / i) / 60. Available wheel force F = τ_motor · i · η / r. Increasing i lowers v_max but raises F proportionally.\n\nA practical method: pick the ratio that lets the car reach about 70–80% of its theoretical top speed on the longest straight. If the car never reaches near top speed before braking, reduce speed (increase i) for better acceleration; if it reaches top speed early and stays there, decrease i for more speed. Remember the traction limit: extra torque that only spins the tyres is wasted.",
      },
    ],
    workingPrinciple:
      "Meshing gear teeth move at the same pitch-line speed, so a gear with more teeth (larger radius) must rotate more slowly. Because power in equals power out (minus friction), the slower gear delivers proportionally more torque: τ_out·ω_out = η·τ_in·ω_in. Stacking stages multiplies both the speed reduction and the torque gain.",
    diagrams: [
      { kind: "formula", latexish: "i = N_driven / N_driver ;  ω_out = ω_in / i ;  τ_out = τ_in · i · η", legend: { i: "gear ratio", N_driven: "teeth on the output gear", N_driver: "teeth on the input gear", "η": "efficiency (0–1)" } },
      { kind: "flow", steps: ["Motor shaft (high RPM, low torque)", "Stage 1 pinion 10T → 30T (÷3)", "Stage 2 pinion 10T → 40T (÷4)", "Output shaft: ÷12 speed, ≈×12·η torque", "Wheel"] },
    ],
    examples: [
      {
        title: "Comparing two N20 versions",
        body: "Two N20 motors use the same motor but different gearboxes; one is labelled with about twice the output RPM of the other. The faster one has roughly half the gear ratio, so it delivers roughly half the torque at the wheel. On a 65 mm wheel, if the fast version gives ≈ 1.0 m/s top speed, the slow one gives ≈ 0.5 m/s but can push about twice as hard.",
      },
      {
        title: "Ratio from the track",
        body: "Your longest straight is 2 m and your car can accelerate at about 3 m/s². Distance to reach speed v is v²/(2a). To reach 2.5 m/s you would need 2.5² / 6 ≈ 1.04 m, half the straight, which is fine. To reach 4 m/s you would need 2.7 m, longer than the straight, so gearing for 4 m/s would waste acceleration. Choose a ratio whose top speed is about 2.5–3 m/s.",
      },
    ],
    commonMistakes: [
      { mistake: "Thinking a gearbox increases power.", why: "Gearing trades speed for torque; friction means output power is always a little less than input power.", fix: "Use P = τ·ω to check: if torque goes up 3×, speed must go down at least 3×." },
      { mistake: "Adding ratios of stages instead of multiplying.", why: "Each stage reduces the speed already reduced by the previous one.", fix: "Total ratio = product of stage ratios (3 × 4 = 12, not 7)." },
      { mistake: "Picking the highest top-speed gearing for every track.", why: "On short straights the car never reaches top speed, so it loses on acceleration.", fix: "Match the ratio to the longest straight using v²/(2a)." },
    ],
    keyTakeaways: [
      "Gear ratio i = driven teeth / driver teeth.",
      "Output speed ÷ i, output torque × i × η.",
      "Multi-stage ratios multiply; efficiencies multiply too.",
      "Each external gear mesh reverses direction.",
      "Pick the ratio so the car uses its top speed on the longest straight.",
    ],
    relatedComponents: ["N20 Micro Metal Gear Motor", "TT Yellow Gear Motor", "BO Gear Motor"],
    youtubeSearch: "gear ratio explained torque speed robot gearbox",
    quiz: [
      {
        type: "calculate",
        prompt: "A 12-tooth pinion on a motor spinning at 6000 RPM drives a 36-tooth gear. What is the output speed?",
        options: ["18000 RPM", "3000 RPM", "2000 RPM", "500 RPM"],
        answerIndex: 2,
        explanation: "i = 36/12 = 3, so output = 6000 / 3 = 2000 RPM. 18000 RPM multiplies instead of divides: the larger driven gear turns more slowly, not faster.",
        difficulty: 1,
      },
      {
        type: "calculate",
        prompt: "A two-stage gearbox has stages 10T→30T and 10T→40T. Input torque is 0.01 N·m and overall efficiency is 80%. What is the output torque?",
        options: ["0.12 N·m", "0.096 N·m", "0.056 N·m", "0.0096 N·m"],
        answerIndex: 1,
        explanation: "Total ratio = 3 × 4 = 12. τ_out = 0.01 × 12 × 0.8 = 0.096 N·m. 0.12 N·m forgets the losses; 0.056 N·m comes from adding the ratios (3 + 4 = 7) instead of multiplying them.",
        difficulty: 2,
      },
      {
        type: "predict-movement",
        prompt: "You replace a 1:48 gearbox with a 1:120 gearbox, keeping the same motor, wheels and battery. How does the car behave on a short twisty track?",
        options: ["Lower top speed but stronger acceleration and hill climbing", "Higher top speed and weaker acceleration", "No change, because the motor is the same", "The car drives backwards because there are more gear stages"],
        answerIndex: 0,
        explanation: "A higher reduction (120 vs 48) divides speed by 2.5× more and multiplies torque by about the same factor (minus losses). Direction depends on the number of meshes and is simply corrected in wiring; it does not make the car 'drive backwards' as a behaviour change.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt: "Gear A (driver) turns clockwise and meshes directly with gear B. Gear B meshes with gear C. Which way does gear C turn?",
        options: ["Anticlockwise", "Clockwise", "It cannot turn", "It depends on the number of teeth"],
        answerIndex: 1,
        explanation: "Each external mesh reverses direction: A clockwise → B anticlockwise → C clockwise. Tooth counts change speed, not direction, which is why the 'depends on teeth' option is wrong.",
        difficulty: 1,
      },
    ],
  }),

  defineTopic("race", 9, {
    slug: "wheel-selection",
    title: "Wheel Selection",
    minutes: 8,
    summary: "How wheel diameter, width, mass and hub fit change a race car's speed, force, grip and straight-line tracking.",
    introduction:
      "Changing the wheels is the quickest way to change a race car's behaviour. Bigger wheels mean more speed and less force; smaller wheels mean the opposite. Width and tyre material decide grip, wheel mass affects acceleration, and a sloppy hub fit can ruin straight-line driving. This topic shows how to choose with numbers instead of guesswork.",
    beginner:
      "Imagine two people walking at the same number of steps per minute. One takes long strides, the other short steps. The long-stride walker covers more ground, but each stride takes more effort. Wheels work the same way. Every turn of the motor rolls the robot forward by one wheel circumference, so a bigger wheel goes further per turn and the robot is faster.\n\nBut there is no free lunch. With a bigger wheel the motor has to push with a longer 'lever', so the push on the ground is smaller. On a flat track that might be fine; on a ramp the robot could struggle.\n\nWheels also need to grip. A wider tyre made of soft rubber holds the track well; a thin hard plastic wheel slides. And the wheel must fit the motor shaft tightly. If it wobbles, the robot will not drive straight.\n\nFinally, both wheels must be the same size. If one is even a little smaller, that side travels less each turn and the robot slowly curves. Racers often buy wheels in matched sets and check them with calipers.",
    technical: [
      {
        heading: "Diameter: speed versus force",
        body:
          "Speed is proportional to diameter: v = π·D·N/60. Ground force is inversely proportional to radius: F = τ/r.\n\nExample with a 200 RPM motor: a 43 mm wheel gives 0.45 m/s, a 65 mm wheel 0.68 m/s and an 85 mm wheel 0.89 m/s. Going from 43 to 85 mm almost doubles speed but nearly halves the force available for acceleration. Changing wheel diameter therefore acts exactly like changing the gear ratio.",
      },
      {
        heading: "Width, mass and inertia",
        body:
          "A wider contact patch does not change the ideal friction formula F = μ·N, but in practice wider soft tyres grip more consistently on real, slightly dusty or uneven tracks and wear more slowly.\n\nWheel mass matters twice: it adds to the robot's mass and it must be spun up. A solid disk wheel stores rotational energy ½·I·ω² with I = ½·m·r², which adds the equivalent of half its own mass to what the motors must accelerate (a thin ring would add its full mass). Light wheels help acceleration and braking.",
      },
      {
        heading: "Fit, alignment and matching",
        body:
          "- TT/BO motors use a double-flat (D-shaped) plastic shaft; N20 motors use a 3 mm D-shaft. Use wheels or hubs designed for that shaft, with a set screw where possible.\n- A wobbling wheel changes its effective radius every turn and causes vibration.\n- Left and right wheel diameters must match: if one wheel is 1% smaller, that side travels 1% less per turn, so the car curves towards the smaller wheel.",
      },
    ],
    workingPrinciple:
      "A rolling wheel without slip converts each revolution into one circumference of travel (π·D), and converts axle torque into ground force F = τ/r. Its tyre transmits that force through friction up to μ·N. Diameter therefore scales speed and force in opposite directions, while the tyre and wheel mass determine how much of that force reaches the track and how quickly the car responds.",
    diagrams: [
      { kind: "signal", title: "Speed vs wheel diameter for a 200 RPM motor", xLabel: "Wheel diameter (mm)", yLabel: "Speed (m/s)", series: [ { label: "v = π·D·200/60", points: [[30, 0.31], [43, 0.45], [65, 0.68], [85, 0.89], [100, 1.05]] } ] },
      { kind: "formula", latexish: "v ∝ D ;  F = τ / (D/2)", legend: { v: "linear speed", D: "wheel diameter", F: "ground force", "τ": "wheel torque" } },
    ],
    examples: [
      {
        title: "Upgrading wheels on a BO-motor car",
        body: "A car with 65 mm wheels reaches 0.68 m/s with 200 RPM motors. Swapping to 85 mm wheels raises theoretical speed to 0.89 m/s (+31%) but cuts ground force by the same 31% (65/85 ≈ 0.76). Test acceleration over the first 50 cm with a stopwatch or phone video; if the car is slower to the first corner, the bigger wheels are not worth it on this track.",
      },
      {
        title: "Software correction for unequal wheels",
        body: "If you cannot get perfectly matched wheels, measure each wheel's diameter with calipers and scale the PWM of the larger-wheel side down by the ratio of diameters. This is a first approximation; closed-loop encoder control is better.",
        code: `const float D_LEFT = 65.4;
const float D_RIGHT = 64.6;
const int ENA = 5, ENB = 6;

int leftPwm(int base) {
  if (D_LEFT > D_RIGHT) return (int)(base * D_RIGHT / D_LEFT);
  return base;
}

int rightPwm(int base) {
  if (D_RIGHT > D_LEFT) return (int)(base * D_LEFT / D_RIGHT);
  return base;
}

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(ENB, OUTPUT);
  Serial.begin(9600);
  Serial.println(leftPwm(200));
  Serial.println(rightPwm(200));
}

void loop() {
}`,
      },
    ],
    commonMistakes: [
      { mistake: "Fitting the largest wheels available for top speed.", why: "Ground force drops as radius grows, so acceleration and ramp climbing suffer.", fix: "Treat wheel size like gearing and test acceleration over the first metre." },
      { mistake: "Ignoring a loose wheel on the shaft.", why: "Wobble changes effective radius, causes vibration and makes the car wander.", fix: "Use hubs with set screws or wheels made for the exact shaft type; add thread-locker if needed." },
      { mistake: "Mixing wheels from different batches.", why: "Small diameter differences make the car curve towards the smaller wheel.", fix: "Measure with calipers and pair matched wheels; correct residual differences in code." },
    ],
    keyTakeaways: [
      "Speed scales with wheel diameter; ground force scales inversely with radius.",
      "Changing wheel size has the same effect as changing gear ratio.",
      "Light wheels improve acceleration and braking.",
      "Shaft fit and alignment are as important as size.",
      "Unequal diameters make the car curve towards the smaller wheel.",
    ],
    relatedComponents: ["BO Gear Motor", "N20 Micro Metal Gear Motor", "Wheel Hubs", "Rubber Robot Wheels"],
    youtubeSearch: "robot wheel size speed torque selection",
    quiz: [
      {
        type: "calculate",
        prompt: "A motor turns at 200 RPM. What is the robot's speed with 85 mm wheels?",
        options: ["0.57 m/s", "0.68 m/s", "0.89 m/s", "1.78 m/s"],
        answerIndex: 2,
        explanation: "v = π × 0.085 × 200 / 60 ≈ 0.89 m/s. 0.68 m/s is the result for 65 mm wheels, and 1.78 m/s doubles the answer by using 2π with the diameter instead of the radius.",
        difficulty: 1,
      },
      {
        type: "predict-movement",
        prompt: "Both motors turn at exactly the same RPM, but the LEFT wheel is 60 mm and the RIGHT wheel is 65 mm in diameter. What does the car do?",
        options: ["Curves to the left", "Curves to the right", "Drives straight", "Spins on the spot"],
        answerIndex: 0,
        explanation: "The smaller left wheel covers less distance per revolution, so the left side lags and the car curves towards the left. It is not straight because equal RPM does not mean equal ground speed when diameters differ.",
        difficulty: 2,
      },
      {
        type: "identify-component",
        prompt: "A small metal part with a set screw clamps onto a 3 mm D-shaft and has threaded holes for bolting on a wheel. What is it?",
        options: ["Ball caster", "Motor bracket", "Wheel hub (mounting hub)", "Encoder disc"],
        answerIndex: 2,
        explanation: "A mounting hub couples a shaft to a wheel. A motor bracket holds the motor body to the chassis, not the wheel to the shaft; an encoder disc only provides slots for a sensor to count.",
        difficulty: 1,
      },
      {
        type: "mcq",
        prompt: "Why do lighter wheels help a race car accelerate, beyond just reducing total mass?",
        options: ["They increase the friction coefficient", "Less rotational inertia needs to be spun up", "They raise the motor's no-load RPM", "They increase the gear ratio"],
        answerIndex: 1,
        explanation: "Wheels must be accelerated both forward and in rotation; a solid disk adds about half its mass again as rotational inertia. Lighter wheels reduce this. They do not change μ, the motor's no-load speed or the gearbox ratio.",
        difficulty: 2,
      },
    ],
  }),
];
