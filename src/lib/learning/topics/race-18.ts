import { defineTopic } from "../define";
import type { Topic } from "../types";

export const RACE_18: Topic[] = [
  // ---------------------------------------------------------------- 18
  defineTopic("race", 18, {
    slug: "speed-measurement",
    title: "Speed Measurement",
    minutes: 13,
    summary: "Measuring wheel RPM and robot speed from encoder pulses or lap gates, and understanding resolution, timing and integer-maths pitfalls.",
    introduction:
      "You cannot improve what you cannot measure. A race team that knows its true straight-line speed, cornering speed and lap time can make decisions with data instead of guesses. Speed can be measured on the robot (encoders, counting pulses per time) or off the robot (timing gates, a stopwatch on a known distance).\n\nThis topic shows the two encoder methods (counting pulses in a time window and timing the gap between pulses), how to convert counts to RPM and metres per second, how to keep millis() timing correct, and how to avoid the integer-division trap that silently ruins many students' numbers.",
    beginner:
      "Speed is distance divided by time. If a runner covers 100 metres in 20 seconds, their average speed is 5 metres per second. For a robot, we do the same thing: find out how far it moved and how long it took.\n\nOn the robot, encoders give us a pulse for every tiny piece of wheel rotation. There are two ways to use those pulses. The first is like counting cars passing your house in one minute: count pulses in a fixed window, say 100 milliseconds, and turn that count into a speed. This works well when the wheel spins fast and lots of pulses arrive. The second is like timing how long it takes between two cars: measure the time from one pulse to the next. When the wheel turns slowly and pulses are rare, this is much more precise.\n\nOff the robot, the simplest speed meter is a timing gate: an IR beam or a line on the track at a known distance. Record the time at the start line and the finish line and divide distance by time to get average speed.\n\nThe Arduino helps with its built-in clock, millis(), which counts milliseconds since power-on. The key habit is to always store times in unsigned long variables and compare them by subtraction, so your measurements stay correct even after hours of running.",
    technical: [
      {
        heading: "Counting method (frequency)",
        body:
          "Count encoder edges dn over a fixed interval dt. With N counts per wheel revolution:\n\n- Wheel speed (rev/s) = dn / (N x dt)\n- RPM = 60 x dn / (N x dt)\n- Ground speed v = RPM x pi x D / 60\n\nResolution: one count of uncertainty gives an RPM step of 60 / (N x dt). With N = 360 and dt = 0.05 s, the step is 60 / 18 = 3.3 RPM, which is fine at 300 RPM (about 1%) but poor at 10 RPM (33%). Longer windows improve resolution but delay the measurement, which hurts a speed controller."
      },
      {
        heading: "Period method",
        body:
          "Measure the time T between consecutive edges with micros(). Then RPM = 60 / (N x T). With 4 microsecond micros() resolution on a 16 MHz Uno, this is excellent at low speed. At high speed the edges come so fast that T is only a few tens of microseconds, the relative timing error grows and the ISR load rises. Many robots use the period method below some speed and the counting method above it, or average several periods.\n\nAlways add a timeout: if no edge arrives within, say, 100 ms, report zero speed instead of the last stale value."
      },
      {
        heading: "Timing correctly with millis()",
        body:
          "millis() returns unsigned long and wraps after about 49.7 days. The pattern if (millis() - lastMs >= interval) is rollover-safe because unsigned subtraction wraps too.\n\nStoring the time in an int is a classic bug: int on the Uno is 16-bit (-32768 to 32767), so after about 32.8 s the stored value becomes negative and the subtraction gives nonsense.\n\nUse the actual elapsed time in the formula rather than the nominal interval, because loop jitter means the window is rarely exactly 100 ms."
      },
      {
        heading: "Integer maths pitfalls",
        body:
          "On the Uno, int is 16-bit and integer division truncates. counts / cpr * 600 with counts = 450 and cpr = 360 gives 1 * 600 = 600, not 750. Fix by multiplying first in a long (450L * 600 / 360 = 750) or by using float (450 * 600.0 / 360).\n\nWatch overflow too: 450 * 600 = 270000 does not fit in an int, so multiply-first must use long (the L suffix) or the result wraps."
      }
    ],
    workingPrinciple:
      "Speed is the rate of change of position. An encoder converts position into a count, so the change in count over a measured time interval, scaled by distance-per-count, gives speed. The Arduino timestamps the measurement with millis() or micros(); the count change is read atomically from the interrupt counter, and the result is converted to RPM or m/s using the wheel circumference and counts per revolution.",
    diagrams: [
      {
        kind: "formula",
        latexish: "RPM = \\frac{60 \\cdot \\Delta n}{N \\cdot \\Delta t};   v = \\frac{RPM \\cdot \\pi D}{60}",
        legend: { "\\Delta n": "encoder counts in the window", N: "counts per wheel revolution", "\\Delta t": "window length (s)", D: "wheel diameter (m)", v: "ground speed (m/s)" }
      },
      {
        kind: "flow",
        steps: ["Every 100 ms (millis() - last >= 100)", "Copy tick counter with interrupts disabled", "dn = ticks - lastTicks, dt = now - lastMs", "RPM = dn x 60000.0 / (N x dt)", "Save ticks and time for next window"]
      }
    ],
    examples: [
      {
        title: "Windowed RPM measurement",
        body: "Counts rising edges of channel A on pin 2 and prints RPM every 100 ms using the real elapsed time. COUNTS_PER_REV is the number of rising A edges per wheel revolution (calibrate it).",
        code: `const byte ENC_A = 2;
const long COUNTS_PER_REV = 360;
volatile long ticks = 0;
unsigned long lastMs = 0;
long lastTicks = 0;

void onA() { ticks++; }

void setup() {
  Serial.begin(115200);
  pinMode(ENC_A, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ENC_A), onA, RISING);
}

void loop() {
  unsigned long now = millis();
  if (now - lastMs >= 100) {
    noInterrupts();
    long t = ticks;
    interrupts();
    long dn = t - lastTicks;
    unsigned long dt = now - lastMs;
    float rpm = dn * 60000.0 / (COUNTS_PER_REV * dt);
    Serial.println(rpm);
    lastTicks = t;
    lastMs = now;
  }
}`
      },
      {
        title: "Lap timer with a start/finish gate",
        body: "A TCRT5000 on the robot sees a cross line at the start/finish. Each new detection (after a 1 s lockout) prints the lap time in milliseconds. Average speed = track length / lap time; a 6 m lap in 4200 ms is 1.43 m/s.",
        code: `const byte GATE = 7;  // digital output of a line sensor module
unsigned long lastLap = 0;
bool wasOnLine = false;

void setup() {
  Serial.begin(9600);
  pinMode(GATE, INPUT);
  lastLap = millis();
}

void loop() {
  bool onLine = (digitalRead(GATE) == HIGH); // check your module: some output LOW on black
  unsigned long now = millis();
  if (onLine && !wasOnLine && now - lastLap > 1000) {
    Serial.print("Lap ms: ");
    Serial.println(now - lastLap);
    lastLap = now;
  }
  wasOnLine = onLine;
}`
      }
    ],
    commonMistakes: [
      { mistake: "Storing millis() in an int.", why: "int is 16-bit on the Uno and overflows after about 32.8 seconds, breaking every interval comparison.", fix: "Use unsigned long for all time variables and compare with now - last >= interval." },
      { mistake: "Dividing before multiplying in integer maths.", why: "Integer division truncates, so counts / cpr * 600 throws away the fractional revolutions.", fix: "Multiply first using long (counts * 600L / cpr) or use float arithmetic." },
      { mistake: "Using a very short counting window at low speed.", why: "Only a few counts arrive, so one count of jitter is a large percentage error.", fix: "Use a longer window, the period method, or a moving average." },
      { mistake: "Reporting the last speed forever when the wheel stops.", why: "With the period method no new edge arrives, so the old period is never updated.", fix: "Add a timeout that sets speed to zero if no edge arrives in time." }
    ],
    keyTakeaways: [
      "RPM = 60 x counts / (counts per rev x seconds); v = RPM x pi x D / 60.",
      "Counting pulses suits high speed; timing between pulses suits low speed.",
      "Time variables must be unsigned long and compared by subtraction.",
      "Multiply before dividing (in long or float) to avoid integer truncation.",
      "Timing gates give simple, trustworthy average speed and lap times."
    ],
    relatedComponents: ["Magnetic Rotary Encoder", "Arduino Uno R3", "TCRT5000", "N20 Micro Metal Gear Motor"],
    youtubeSearch: "Arduino encoder RPM measurement millis tutorial",
    quiz: [
      {
        type: "calculate",
        prompt: "Your encoder gives 300 counts per wheel revolution. In a 0.1 s window you count 150 pulses. What is the wheel speed?",
        diagram: { kind: "formula", latexish: "RPM = \\frac{60 \\cdot \\Delta n}{N \\cdot \\Delta t}", legend: { "\\Delta n": "150 counts", N: "300 counts/rev", "\\Delta t": "0.1 s" } },
        options: ["300 rpm", "150 rpm", "50 rpm", "3000 rpm"],
        answerIndex: 0,
        explanation: "150 / 300 = 0.5 revolution in 0.1 s = 5 rev/s = 300 rpm. 150 rpm forgets that 0.1 s is a tenth of a second (it treats the window as 0.2 s), and 3000 rpm multiplies by 10 twice.",
        difficulty: 2
      },
      {
        type: "code-output",
        prompt: "What does this sketch print on the Uno?",
        code: `void setup() {
  Serial.begin(9600);
  int counts = 450;
  int cpr = 360;
  int rpm = counts / cpr * 600;
  Serial.println(rpm);
}

void loop() {}`,
        options: ["0", "750", "1", "600"],
        answerIndex: 3,
        explanation: "counts / cpr is integer division: 450 / 360 = 1 (the 0.25 is thrown away). 1 x 600 = 600. The mathematically correct 750 needs the multiplication first in a long (450L * 600 / 360) or float maths.",
        difficulty: 2
      },
      {
        type: "debug-code",
        prompt: "This speed logger works for about half a minute, then prints on every loop instead of every 100 ms. What is the fix?",
        code: `int lastMs = 0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  if (millis() - lastMs >= 100) {
    lastMs = millis();
    Serial.println("sample");
  }
}`,
        options: [
          "Replace the if with delay(100)",
          "Change 100 to 100.0",
          "Declare lastMs as unsigned long",
          "Use Serial.print instead of Serial.println"
        ],
        answerIndex: 2,
        explanation: "int is 16-bit on the Uno. After about 32.8 s, millis() no longer fits and lastMs becomes negative; converted for the subtraction it becomes a huge number and the condition is true every loop. unsigned long matches millis() and keeps the subtraction rollover-safe. delay(100) would hide the symptom but block the whole robot.",
        difficulty: 3
      },
      {
        type: "mcq",
        prompt: "At very low wheel speeds, why is timing the gap between encoder pulses usually better than counting pulses in a short window?",
        options: [
          "Timing the gap uses less memory",
          "Few pulses arrive per window, so one count of error is a large percentage; the gap is measured precisely with micros()",
          "Counting pulses only works with optical encoders",
          "Interrupts cannot count slow pulses"
        ],
        answerIndex: 1,
        explanation: "With few counts per window, quantisation (plus or minus one count) dominates. Measuring the period with micros() gives fine resolution at low speed. Interrupts count slow pulses perfectly well, so that option is wrong; the problem is resolution, not detection.",
        difficulty: 2
      }
    ]
  }),

  // ---------------------------------------------------------------- 19
  defineTopic("race", 19, {
    slug: "acceleration",
    title: "Acceleration",
    minutes: 13,
    summary: "How motor torque, robot mass and tyre grip set how fast a race car can gain speed, and how to ramp PWM to launch without wheelspin.",
    introduction:
      "Races are often won out of the corners, not on the straights. A robot that reaches top speed quickly spends more of the lap fast. Acceleration depends on three things you can engineer: the force the motors can deliver at the wheels, the mass of the robot, and the grip between tyres and track.\n\nThis topic applies Newton's second law to your robot, shows when you are torque-limited versus grip-limited, and gives code for a smooth PWM ramp that launches hard without spinning the wheels.",
    beginner:
      "Think of pushing a shopping trolley. An empty trolley speeds up easily; a full one needs a much bigger push for the same result. That is Newton's second law: acceleration equals force divided by mass. For your robot, the force comes from the motors turning the wheels, and the mass is everything on the chassis.\n\nBut there is a catch. Try to sprint on ice and your feet just slip. Wheels are the same: if the motors push harder than the tyres can grip, the wheels spin and the robot actually accelerates less. So there are two ceilings on acceleration: how strong the motors are, and how much grip the tyres have. Whichever is lower is your real limit.\n\nFor most small robots, heavy batteries and strong motors mean grip is the limit on launch. That is why a gentle ramp (going from zero to full power over a fraction of a second rather than instantly) often gives a faster start than slamming the throttle. It also protects your electronics, because a motor starting from standstill draws its biggest current, called stall current, and that can make the battery voltage sag and reset the Arduino.\n\nLighter robots accelerate better with the same motors. Every gram you remove helps acceleration, braking and cornering at once.",
    technical: [
      {
        heading: "Newton's second law for a robot",
        body:
          "a = F / m, where F is the net forward force at the tyre contact patches.\n\nDrive force from torque: each motor delivers torque tau at the wheel shaft, and the force at the ground is F = tau / r, where r is wheel radius. For n driven wheels, F_total = n x tau / r.\n\nWorked example (hypothetical numbers): two motors each producing 0.05 N m at the wheel at the speed of interest, wheel radius 0.02 m, robot mass 0.8 kg. F = 2 x 0.05 / 0.02 = 5 N, so a = 5 / 0.8 = 6.25 m/s^2.\n\nMotor torque falls as speed rises (roughly linearly from stall torque to zero at no-load speed for a brushed DC motor), so acceleration is greatest at launch and drops off towards top speed."
      },
      {
        heading: "Grip limit",
        body:
          "Maximum friction force = mu x N, where N is the normal force on the driven wheels. If all the weight is on the driven wheels, N = m x g and a_max = mu x g.\n\nWith mu = 0.8: a_max = 0.8 x 9.81 = 7.85 m/s^2. If only 70% of the weight is on the drive wheels (2WD with a front caster carrying 30%), a_max = 0.7 x 0.8 x 9.81 = 5.5 m/s^2 even though the motors in the previous example could deliver 6.25 m/s^2. That robot is grip-limited: extra motor torque just spins the wheels.\n\nWeight transfer: under acceleration, load shifts towards the rear by m x a x h / L (h = CoG height, L = wheelbase). Rear-wheel-drive robots gain grip when accelerating; front-wheel-drive ones lose it."
      },
      {
        heading: "Time and distance to reach speed",
        body:
          "For constant acceleration: t = v / a and s = v^2 / (2a).\n\nExample: to reach 1.5 m/s at 5 m/s^2 takes 0.3 s and 0.225 m. On a 1 m straight, the robot spends nearly a quarter of it accelerating, which is why short tracks reward acceleration more than top speed.\n\nGearing trades these off: a higher reduction multiplies torque (more acceleration, up to the grip limit) but lowers top speed."
      },
      {
        heading: "Ramping PWM",
        body:
          "A slew-rate limiter moves the PWM command towards the target by at most STEP every few milliseconds. For example, STEP = 5 every 10 ms reaches 255 from 0 in about 0.5 s. Tune the ramp until the wheels just stop slipping on launch. Ramping also limits the stall-current spike, reducing battery sag that can reset the controller."
      }
    ],
    workingPrinciple:
      "The motor converts current into torque; the wheel converts torque into a forward push on the track (F = tau / r). That push, resisted by the robot's inertia, produces acceleration a = F / m. The push can never exceed the friction available at the tyres (mu x normal force); beyond that the tyre slips and the usable force drops. Controlling how quickly the PWM rises keeps the requested force just below the grip limit.",
    diagrams: [
      {
        kind: "formula",
        latexish: "a = \\min\\left( \\frac{n \\tau}{r m}, \\; \\mu g \\cdot f_{drive} \\right)",
        legend: { n: "number of driven wheels", "\\tau": "torque per driven wheel (N m)", r: "wheel radius (m)", m: "robot mass (kg)", "\\mu": "tyre-track friction coefficient", g: "9.81 m/s^2", "f_{drive}": "fraction of weight on driven wheels" }
      },
      {
        kind: "signal",
        title: "PWM command: instant step vs ramp",
        xLabel: "time (ms)",
        yLabel: "PWM",
        series: [
          { label: "Step", points: [[0, 0], [0, 255], [600, 255]] },
          { label: "Ramp", points: [[0, 0], [500, 255], [600, 255]] }
        ]
      }
    ],
    examples: [
      {
        title: "Slew-rate limited launch",
        body: "The PWM rises by 5 every 10 ms until it reaches the target, about 0.45 s from 0 to 220. Direction pins are assumed already set (see Motor Direction).",
        code: `const int ENA = 9;
int current = 0;
int target = 220;
const int STEP = 5;
unsigned long lastMs = 0;

void setup() {
  pinMode(ENA, OUTPUT);
}

void loop() {
  if (millis() - lastMs >= 10) {
    lastMs = millis();
    if (current < target) current = min(current + STEP, target);
    else if (current > target) current = max(current - STEP, target);
    analogWrite(ENA, current);
  }
}`
      },
      {
        title: "Finding the grip limit experimentally",
        body: "Mark a 1 m straight. Launch with ramp times of 0, 200, 400 and 600 ms and record the time to cross the 1 m line (stopwatch app with slow-motion video, or a timing gate). Plot time against ramp length. The fastest ramp that does not leave black marks or show wheelspin is your best launch. Repeat after cleaning the tyres, because dust lowers mu dramatically."
      }
    ],
    commonMistakes: [
      { mistake: "Launching at full PWM instantly on a dusty track.", why: "Requested force exceeds mu x N, the tyres slip, and sliding friction is lower than static friction, so the launch is slower.", fix: "Ramp the PWM and clean the tyres before each run." },
      { mistake: "Adding stronger motors to a grip-limited robot.", why: "If a = mu x g already caps acceleration, more torque only spins the wheels and adds mass.", fix: "Improve grip (softer tyres, more weight on drive wheels) or reduce mass before upgrading motors." },
      { mistake: "Ignoring the stall-current spike at launch.", why: "Motors from standstill draw their largest current, which sags the battery and can reset the Arduino.", fix: "Ramp the PWM, use a battery that can supply the current, and add bulk capacitance near the driver." },
      { mistake: "Thinking top speed is the only thing that matters.", why: "On short tracks, much of the lap is spent accelerating and braking.", fix: "Measure time over the actual straight lengths and gear for the best lap, not the best top speed." }
    ],
    keyTakeaways: [
      "a = F / m with F = n x tau / r at the wheels.",
      "Grip caps acceleration at about mu x g x (fraction of weight on driven wheels).",
      "Whichever limit is lower (torque or grip) decides your real acceleration.",
      "Ramping PWM prevents wheelspin and battery sag on launch.",
      "Reducing mass improves acceleration, braking and cornering together."
    ],
    relatedComponents: ["N20 Micro Metal Gear Motor", "BO Gear Motor", "Silicone Robot Wheels", "LiPo 2S Battery", "Arduino Uno R3", "TB6612FNG"],
    youtubeSearch: "robot acceleration traction wheelspin explained physics",
    quiz: [
      {
        type: "calculate",
        prompt: "A 0.5 kg race robot gets a net forward force of 2 N from its wheels. What is its acceleration?",
        options: ["0.25 m/s^2", "1 m/s^2", "4 m/s^2", "10 m/s^2"],
        answerIndex: 2,
        explanation: "a = F / m = 2 / 0.5 = 4 m/s^2. 0.25 m/s^2 comes from dividing the wrong way (m / F = 0.5 / 2); 1 and 10 m/s^2 do not follow from a = F / m with these numbers.",
        difficulty: 1
      },
      {
        type: "predict-movement",
        prompt: "A powerful robot is launched from rest with the PWM jumping instantly from 0 to 255 on a dusty, slippery track. What is most likely to happen?",
        options: [
          "It reaches top speed faster than with any ramp",
          "The wheels spin and the robot wiggles sideways, giving a slower start than a short ramp would",
          "The robot does not move at all",
          "It drives backwards"
        ],
        answerIndex: 1,
        explanation: "The requested force is far above mu x N, so the tyres break traction. Sliding friction is lower than static friction, so actual acceleration drops, and unequal slip on each side makes the robot wiggle. A ramp keeps the tyres just below the slip limit, which is faster overall.",
        difficulty: 2
      },
      {
        type: "code-output",
        prompt: "What does this ramp sketch print?",
        code: `void setup() {
  Serial.begin(9600);
  int pwm = 0;
  for (int i = 0; i < 4; i++) {
    pwm = pwm + 70;
    if (pwm > 255) pwm = 255;
  }
  Serial.println(pwm);
}

void loop() {}`,
        options: ["255", "280", "210", "70"],
        answerIndex: 0,
        explanation: "The loop runs 4 times: 70, 140, 210, then 280, which is clamped to 255. So it prints 255. 280 forgets the clamp, and 210 stops one iteration early (the loop runs for i = 0, 1, 2, 3).",
        difficulty: 1
      },
      {
        type: "mcq",
        prompt: "A robot's motors are strong enough to spin the wheels at launch. What now sets its maximum acceleration?",
        options: [
          "The PWM frequency",
          "The Arduino's clock speed",
          "The battery capacity in mAh",
          "Tyre grip: about mu x g, scaled by the share of weight on the driven wheels"
        ],
        answerIndex: 3,
        explanation: "Once torque exceeds what the tyres can transmit, friction (mu x normal force on the driven wheels) is the ceiling, giving a_max of about mu x g x weight fraction. Battery capacity (mAh) affects run time, not instantaneous force, and PWM frequency does not change the average force much.",
        difficulty: 2
      }
    ]
  }),

  // ---------------------------------------------------------------- 20
  defineTopic("race", 20, {
    slug: "braking",
    title: "Braking",
    minutes: 13,
    summary: "Coasting, short-brake and reverse braking with real drivers, plus the physics of braking distance so your robot slows down exactly where it should.",
    introduction:
      "Brakes make a race car fast. If you can stop quickly and predictably, you can stay at full speed later into each straight before slowing for a corner. Small robots have no brake pads; they brake electrically using the motor itself.\n\nIn this topic you will learn the three ways to slow a DC motor (coast, short brake, reverse), the exact pin states that produce them on the L298N and TB6612FNG, and how to calculate braking distance from speed and tyre grip.",
    beginner:
      "Imagine riding a bicycle downhill. If you stop pedalling, you coast and slowly lose speed. If you squeeze the brakes, you slow much faster. If you could somehow pedal backwards with force, you would slow fastest of all, but you might skid.\n\nA DC motor gives you the same three options. Coast: disconnect the motor and let friction slowly stop it. Short brake: connect the motor's two wires together through the driver. A spinning motor acts as a generator, and shorting it makes the generated current fight the rotation, like a magnetic brake. Reverse: actively drive the motor backwards. That is the strongest, but it causes big current spikes and can lock the wheels.\n\nNo matter how strong the electrical brake is, the tyres can only push back on the track so hard. Beyond the grip limit, the wheels lock and the robot slides, which is both slower and uncontrollable. So the best braking is strong but just below the slip point, and on a differential-drive robot it must be equal on both sides, otherwise the robot swerves.\n\nFinally, braking distance grows with the square of speed. Going twice as fast means needing four times the distance to stop, which is why racers start braking earlier the faster the straight.",
    technical: [
      {
        heading: "Three ways to slow a motor",
        body:
          "- Coast (outputs high-impedance): no current path, only friction and drag slow the robot. Gentle, low deceleration.\n- Short (dynamic) brake: both motor terminals tied to the same rail. Back-EMF E drives current I = E / R through the winding, producing a torque opposing motion; energy is dissipated as heat in the winding. Deceleration falls as speed (and E) falls.\n- Reverse (plugging): supply applied in the opposite direction. Current I = (V + E) / R, so torque is the strongest, but the spike stresses the driver and battery and the motor will start spinning backward if held too long."
      },
      {
        heading: "Driver pin states",
        body:
          "TB6612FNG (STBY = HIGH):\n- IN1 = HIGH, IN2 = HIGH: short brake.\n- IN1 = LOW, IN2 = LOW: stop with outputs off (coast).\n- Direction set and PWM = LOW: short brake. During normal PWM driving, the off-time is spent in brake, which gives tight speed control.\n\nL298N (per L298 datasheet):\n- EN = HIGH, IN1 = IN2 (both HIGH or both LOW): fast motor stop (brake).\n- EN = LOW: free-running motor stop (coast).\n- Because the L298 uses bipolar transistors with roughly 2 V total drop at 1 A, its braking current path is less effective than a MOSFET driver's, so short-brake is weaker.\n\nDRV8833: both inputs HIGH = brake (slow decay), both LOW = coast (fast decay)."
      },
      {
        heading: "Braking distance",
        body:
          "With constant deceleration a, stopping distance s = v^2 / (2a). Maximum deceleration without sliding is a_max = mu x g (if all wheels can brake; scale down by the weight fraction on braked wheels for 2WD with a caster).\n\nWorked example: v = 1.5 m/s, mu = 0.7, all weight on braked wheels. a_max = 0.7 x 9.81 = 6.87 m/s^2, so s = 2.25 / 13.7 = 0.16 m. Coasting might give only 1 m/s^2 of deceleration and need 1.1 m.\n\nDoubling speed to 3 m/s quadruples distance to about 0.66 m at the same deceleration."
      },
      {
        heading: "Friction circle",
        body:
          "Tyres have a total grip budget. Force used for braking cannot also be used for cornering: roughly sqrt(F_brake^2 + F_corner^2) <= mu x N. That is why racers brake in a straight line before a corner and then turn, rather than braking hard mid-corner."
      }
    ],
    workingPrinciple:
      "A spinning DC motor generates a back-EMF proportional to speed. When the driver connects both motor terminals together, that EMF pushes current around the short circuit in the direction that produces torque opposing the rotation, converting kinetic energy into heat in the winding (dynamic braking). Applying reverse voltage adds the supply to the back-EMF for even more opposing torque. The tyres then transmit this opposing torque to the ground, up to the friction limit mu x N.",
    diagrams: [
      {
        kind: "signal",
        title: "Speed after the brake command",
        xLabel: "time (s)",
        yLabel: "speed (m/s)",
        series: [
          { label: "Coast", points: [[0, 1.5], [0.5, 1.1], [1, 0.7], [1.5, 0.35], [2, 0.05]] },
          { label: "Short brake", points: [[0, 1.5], [0.1, 0.8], [0.2, 0.4], [0.3, 0.15], [0.4, 0.02]] },
          { label: "Reverse pulse", points: [[0, 1.5], [0.1, 0.6], [0.2, 0.05], [0.25, 0]] }
        ]
      },
      { kind: "pinout", componentId: "tb6612fng", highlight: ["AIN1", "AIN2", "PWMA", "STBY"] },
      {
        kind: "formula",
        latexish: "s = \\frac{v^2}{2a};   a_{max} = \\mu g",
        legend: { s: "stopping distance (m)", v: "speed (m/s)", a: "deceleration (m/s^2)", "\\mu": "friction coefficient", g: "9.81 m/s^2" }
      }
    ],
    examples: [
      {
        title: "Brake and coast functions for TB6612FNG",
        body: "Two motors on a TB6612FNG. brakeAll() uses short brake on both channels for symmetrical stopping; coastAll() lets the robot roll.",
        code: `const int PWMA = 5, AIN1 = 7, AIN2 = 8;
const int PWMB = 6, BIN1 = 9, BIN2 = 10;
const int STBY = 4;

void brakeAll() {
  digitalWrite(AIN1, HIGH); digitalWrite(AIN2, HIGH);
  digitalWrite(BIN1, HIGH); digitalWrite(BIN2, HIGH);
  analogWrite(PWMA, 255);   analogWrite(PWMB, 255);
}

void coastAll() {
  digitalWrite(AIN1, LOW); digitalWrite(AIN2, LOW);
  digitalWrite(BIN1, LOW); digitalWrite(BIN2, LOW);
}

void forward(int pwm) {
  digitalWrite(AIN1, HIGH); digitalWrite(AIN2, LOW);
  digitalWrite(BIN1, HIGH); digitalWrite(BIN2, LOW);
  analogWrite(PWMA, pwm);   analogWrite(PWMB, pwm);
}

void setup() {
  int pins[] = {PWMA, AIN1, AIN2, PWMB, BIN1, BIN2, STBY};
  for (int i = 0; i < 7; i++) pinMode(pins[i], OUTPUT);
  digitalWrite(STBY, HIGH);
}

void loop() {
  forward(230);
  delay(800);
  brakeAll();
  delay(400);
  forward(230);
  delay(800);
  coastAll();
  delay(1500);
}`
      },
      {
        title: "Short reverse pulse for hard stops",
        body: "For the hardest stop, apply reverse for a short, tuned time (e.g. 40-80 ms) and then short brake so the wheels do not start turning backwards. Tune the pulse on the real track: too long and the robot jerks backwards; too short and it rolls on. Keep both sides identical so the robot stays straight."
      }
    ],
    commonMistakes: [
      { mistake: "Setting PWM to 0 and assuming the robot brakes on every driver.", why: "On a TB6612FNG PWM low brakes, but with IN1 = IN2 = LOW it coasts; on an L298N, EN low coasts. Behaviour depends on the pin pattern.", fix: "Write explicit brake() and coast() functions using the datasheet truth table." },
      { mistake: "Braking one side harder than the other.", why: "Unequal braking torque creates a yaw moment, so the robot swerves towards the side that stops first.", fix: "Brake both channels in the same way at the same time, and check by braking from speed on a straight line." },
      { mistake: "Holding full reverse too long.", why: "After the robot stops, reverse voltage accelerates it backwards and draws large currents.", fix: "Use a short timed reverse pulse followed by short brake." },
      { mistake: "Braking while turning hard.", why: "Braking and cornering share the tyres' limited grip, so the robot slides wide.", fix: "Brake in a straight line before the corner, then turn." }
    ],
    keyTakeaways: [
      "Coast, short brake and reverse give increasing braking strength (and stress).",
      "TB6612FNG: IN1 = IN2 = HIGH is short brake; IN1 = IN2 = LOW is coast.",
      "L298N: EN high with IN1 = IN2 is fast stop; EN low is free-running coast.",
      "Stopping distance s = v^2 / (2a), and a cannot exceed about mu x g.",
      "Brake symmetrically and in a straight line before corners."
    ],
    relatedComponents: ["TB6612FNG", "L298N", "DRV8833", "Arduino Uno R3", "N20 Micro Metal Gear Motor"],
    youtubeSearch: "DC motor dynamic braking vs coasting H-bridge explained",
    quiz: [
      {
        type: "identify-driver",
        prompt: "Which motor driver has a STBY (standby) pin that must be pulled HIGH before any motor will move, and short-brakes when IN1 = IN2 = HIGH?",
        options: ["L298N", "ULN2003 Darlington array", "A single IRF540N MOSFET", "TB6612FNG"],
        answerIndex: 3,
        explanation: "The TB6612FNG has a STBY input (LOW = standby, all outputs off) and its truth table lists IN1 = IN2 = HIGH as short brake. The L298N has no STBY pin, and the ULN2003 and a single MOSFET can only switch a motor one way, so they cannot reverse or short-brake it.",
        difficulty: 1
      },
      {
        type: "predict-movement",
        prompt: "The robot is driving straight at full speed. Motor A (left) and motor B (right) are on a TB6612FNG. The code suddenly sets AIN1 = LOW, AIN2 = LOW and BIN1 = HIGH, BIN2 = HIGH. What happens?",
        options: [
          "It stops dead in a straight line",
          "It swerves to the left while slowing",
          "It swerves to the right while slowing",
          "It speeds up"
        ],
        answerIndex: 2,
        explanation: "The left motor coasts (both inputs LOW) while the right motor short-brakes (both HIGH). The right wheel slows quickly and the left keeps rolling, so the robot yaws towards the braked right side. A straight stop would need the same braking on both sides.",
        difficulty: 2
      },
      {
        type: "predict-circuit",
        prompt: "On an L298N with the ENA jumper fitted (ENA = HIGH), a spinning motor has IN1 = HIGH and IN2 = HIGH applied. What happens?",
        options: [
          "The motor brakes quickly (fast motor stop)",
          "The motor keeps running at full speed forward",
          "The battery is short-circuited through the bridge and the L298N is destroyed",
          "The motor reverses direction"
        ],
        answerIndex: 0,
        explanation: "With IN1 = IN2 both outputs are driven to the same level, so the motor terminals are tied together and its back-EMF produces a braking current: the datasheet calls this fast motor stop. There is no shoot-through because each half-bridge still has only one transistor on (both high-side), so the battery is not shorted.",
        difficulty: 2
      },
      {
        type: "mcq",
        prompt: "Why can switching a fast-spinning motor straight to full reverse reset the Arduino?",
        options: [
          "Reverse PWM uses a different frequency that confuses the Arduino",
          "The back-EMF adds to the supply voltage, causing a large current spike that pulls the battery voltage down",
          "The H-bridge turns completely off in reverse",
          "The encoder starts counting backwards"
        ],
        answerIndex: 1,
        explanation: "During reversal I = (V + E) / R, so current can approach twice stall current. That spike drops the battery voltage (internal resistance) and can brown out the Arduino's supply. The PWM frequency is unchanged by direction, and encoder direction has no effect on the power supply.",
        difficulty: 2
      },
      {
        type: "calculate",
        prompt: "A robot travelling at 2 m/s brakes with a constant deceleration of 5 m/s^2. How far does it travel before stopping?",
        diagram: { kind: "formula", latexish: "s = \\frac{v^2}{2a}", legend: { v: "2 m/s", a: "5 m/s^2" } },
        options: ["0.2 m", "0.8 m", "0.4 m", "2.5 m"],
        answerIndex: 2,
        explanation: "s = v^2 / (2a) = 4 / 10 = 0.4 m. 0.8 m forgets the factor of 2, and 0.2 m uses v instead of v squared (2 / 10).",
        difficulty: 2
      }
    ]
  })
];
