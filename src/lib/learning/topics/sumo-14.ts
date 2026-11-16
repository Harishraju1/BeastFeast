import { defineTopic } from "../define";
import type { Topic } from "../types";

export const SUMO_14: Topic[] = [
  // ───────────────────────────── 14. Sharp IR Sensors ─────────────────────────────
  defineTopic("sumo", 14, {
    slug: "sharp-ir-sensors",
    title: "Sharp IR Sensors",
    minutes: 12,
    summary:
      "How Sharp infrared distance sensors such as the GP2Y0A21YK0F use triangulation to give an analog voltage that tells a sumo robot how far away the opponent is.",
    introduction:
      "Most sumo robots need to 'see' the opponent across the ring. The Sharp GP2Y0A21YK0F is one of the most popular distance sensors for this job: it is small, fast, needs no timing code and gives a single analog voltage that changes with distance. In this topic you will learn how it works, why its output curve is not a straight line, why it can be fooled when an object is too close, and how to read it reliably with an Arduino.",
    beginner:
      "Imagine you stand next to a friend who shines a torch at a wall at a slight angle. If the wall is close, the bright spot appears far to one side of where you are looking. If the wall is far away, the spot appears almost straight ahead. Just by noticing where the spot lands, you can guess the distance - without any stopwatch.\n\nA Sharp IR sensor does exactly this. One window holds an infrared LED (the torch). The other window holds a light-sensitive strip (your eye). The LED sends a narrow beam out; when it hits the opponent, some light bounces back and lands on the strip. The closer the opponent, the further along the strip the spot lands. Electronics inside turn that position into a voltage on the output wire.\n\nTwo things surprise beginners. First, the voltage does not go down evenly as distance goes up - it changes a lot for close objects and only a little for far ones, like the way a car looks much bigger when it moves from 2 m to 1 m than from 20 m to 19 m. Second, if something is closer than about 10 cm the spot misses the strip in a confusing way, and the reading starts falling again, so a very close opponent can look far away.",
    technical: [
      {
        heading: "Triangulation and the PSD",
        body:
          "The sensor contains an IR emitter and a position sensitive detector (PSD) separated by a fixed baseline. The reflected spot lands on the PSD at a position that depends on the angle of the returning light, and that angle depends on distance. Because it measures position rather than brightness, the reading is much less sensitive to target colour than a simple reflectance sensor such as the TCRT5000 - a black-painted opponent still gives a usable reading, although very dark or very shiny surfaces can reduce reliability.\n\n- Supply: 5 V (datasheet operating range about 4.5-5.5 V).\n- Output: one analog voltage, read with analogRead() on A0-A5.\n- Range of the GP2Y0A21YK0F: roughly 10-80 cm.\n- Update rate: the sensor makes a new measurement only every few tens of milliseconds (roughly 40 ms), so sampling it every 1 ms does not give you new information, only the same value plus electrical noise.\n- Current: roughly 30 mA on average, drawn in short pulses as the LED fires.",
      },
      {
        heading: "The nonlinear curve and the minimum-distance ambiguity",
        body:
          "Over its working range the output voltage is roughly proportional to 1/distance: about 0.4 V near 80 cm, climbing to roughly 2-3 V around 10 cm. Below that the curve peaks and then falls again, so one voltage can mean two distances (for example 'very close' and 'about 15 cm').\n\nA useful empirical model is d = K / (raw - C), where raw is the 10-bit ADC reading and K, C are constants you fit from your own measurements. With a 5 V reference, voltage = raw x 5 / 1023, so raw = 410 is about 2.00 V and raw = 100 is about 0.49 V.\n\nWorked example: suppose your calibration gives K = 4800 and C = 20 (placeholder values - fit your own). A reading of 300 gives d = 4800 / 280 = about 17 cm; a reading of 120 gives d = 4800 / 100 = 48 cm. Notice that 180 ADC counts of change covered only 31 cm here, while near 80 cm a few counts cover several centimetres - resolution is much better up close.\n\nHandling the ambiguity: mount the sensor 8-10 cm back from the front edge of the robot (behind the wedge), so the opponent can never get closer than the minimum distance to the sensor face. Many sumo robots simply treat 'reading above threshold' as 'opponent present' and never convert to centimetres at all.",
      },
      {
        heading: "Power noise and filtering",
        body:
          "Because the LED is pulsed, the sensor pulls current spikes from the 5 V rail. These spikes show up as noise on its own output and on other analog sensors. The common fix is a 10 µF (or larger) electrolytic capacitor placed directly across the sensor's Vcc and GND pins, close to the connector.\n\nOn the software side, a median-of-5 filter removes single-sample spikes without slowing the response much. A small moving average also works but blurs fast changes. Use hysteresis for detection: for example declare 'seen' when raw rises above 250 and 'lost' only when it falls below 200, so a reading hovering near one threshold does not make the robot twitch.",
      },
      {
        heading: "Using Sharp sensors in a sumo ring",
        body:
          "A common mini-sumo ring is 77 cm in diameter, so a range of roughly 10-80 cm covers almost the whole arena. Typical layouts use two forward sensors angled slightly outward (left and right) plus optional side sensors. Comparing left and right readings tells you which way to turn; if both are high, the opponent is straight ahead. Keep the beam level and low enough to hit the opponent's body, not pass over a low wedge robot. Mount sensors so they cannot see over the ring edge to people standing outside, or cap your detection distance in software.",
      },
    ],
    workingPrinciple:
      "An IR LED emits a narrow beam. Light reflected from the target returns through a lens to a position sensitive detector a short distance away. The angle of the returning ray, and therefore the spot position on the detector, depends on target distance. Internal signal processing converts spot position into an analog output voltage that is high for close targets and low for distant ones, following an approximately inverse (1/d) curve between about 10 and 80 cm. The Arduino reads this voltage with its 10-bit ADC, filters it and either compares it with a threshold (opponent present or not) or converts it to distance with a calibrated fit.",
    diagrams: [
      {
        kind: "signal",
        title: "Typical shape of a Sharp GP2Y0A21 output curve (illustrative, not datasheet values)",
        xLabel: "Distance (cm)",
        yLabel: "Output (V)",
        series: [
          {
            label: "Output voltage",
            points: [[3, 1.4], [5, 2.3], [7, 2.9], [10, 2.3], [15, 1.6], [20, 1.3], [30, 0.9], [40, 0.75], [60, 0.55], [80, 0.4]],
          },
        ],
      },
      {
        kind: "formula",
        latexish: "d ≈ K / (raw − C),   V = raw × 5 / 1023",
        legend: {
          d: "distance in cm (valid only inside about 10-80 cm)",
          raw: "analogRead() value, 0-1023",
          K: "fit constant from your calibration",
          C: "offset constant from your calibration",
          V: "sensor voltage with a 5 V ADC reference",
        },
      },
      {
        kind: "circuit",
        nodes: [
          { id: "sharp", label: "Sharp GP2Y0A21 (Vo, GND, Vcc)", x: 60, y: 100 },
          { id: "cap", label: "10 µF across Vcc-GND", x: 200, y: 30 },
          { id: "uno5v", label: "Uno 5V", x: 340, y: 30 },
          { id: "unogd", label: "Uno GND", x: 340, y: 170 },
          { id: "unoa2", label: "Uno A2", x: 340, y: 100 },
        ],
        edges: [
          { from: "sharp", to: "uno5v", label: "Vcc (red)", color: "red" },
          { from: "sharp", to: "unogd", label: "GND (black)", color: "black" },
          { from: "sharp", to: "unoa2", label: "Vo (yellow)", color: "yellow" },
          { from: "cap", to: "sharp", label: "close to connector" },
        ],
      },
    ],
    examples: [
      {
        title: "Median-filtered reading with distance conversion",
        body:
          "Reads the sensor five times, sorts the values and keeps the middle one. This removes single spikes caused by the LED pulses. The distance fit uses placeholder constants - measure raw values at 10, 20, 40 and 60 cm with your own sensor and fit K and C.",
        code: `const int SHARP_PIN = A2;
const long K = 4800;   // placeholder: fit from your own calibration
const int C = 20;      // placeholder: fit from your own calibration

int readSharpMedian() {
  int v[5];
  for (int i = 0; i < 5; i++) {
    v[i] = analogRead(SHARP_PIN);
  }
  // insertion sort of 5 values
  for (int i = 1; i < 5; i++) {
    int key = v[i];
    int j = i - 1;
    while (j >= 0 && v[j] > key) {
      v[j + 1] = v[j];
      j--;
    }
    v[j + 1] = key;
  }
  return v[2];
}

void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = readSharpMedian();
  Serial.print("raw=");
  Serial.print(raw);
  if (raw > C + 40) {
    long cm = K / (raw - C);
    Serial.print("  approx cm=");
    Serial.println(cm);
  } else {
    Serial.println("  nothing in range");
  }
  delay(50);  // sensor updates about every 40 ms anyway
}`,
      },
      {
        title: "Left/right opponent presence with hysteresis",
        body:
          "Two Sharp sensors angled slightly outward. Each one uses two thresholds so the 'seen' flag does not flicker when the reading sits near a single limit. The result tells the strategy code which way to turn.",
        code: `const int LEFT_SHARP = A2;
const int RIGHT_SHARP = A3;
const int SEEN_ON = 250;   // tune on your own ring
const int SEEN_OFF = 200;

bool leftSeen = false;
bool rightSeen = false;

bool updateSeen(bool seen, int raw) {
  if (!seen && raw > SEEN_ON) return true;
  if (seen && raw < SEEN_OFF) return false;
  return seen;
}

void setup() {
  Serial.begin(9600);
}

void loop() {
  leftSeen = updateSeen(leftSeen, analogRead(LEFT_SHARP));
  rightSeen = updateSeen(rightSeen, analogRead(RIGHT_SHARP));

  if (leftSeen && rightSeen) Serial.println("AHEAD");
  else if (leftSeen) Serial.println("TURN LEFT");
  else if (rightSeen) Serial.println("TURN RIGHT");
  else Serial.println("SEARCH");
  delay(40);
}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Mounting the sensor right at the front edge of the robot.",
        why: "When the opponent is pressed against your wedge it is closer than about 10 cm, the output falls again and the robot thinks the opponent has gone - so it stops pushing.",
        fix: "Recess the sensor so the closest possible target is still at or beyond the minimum range, or latch 'opponent present' while pushing until another sensor (bumper, current) says otherwise.",
      },
      {
        mistake: "Treating the voltage as linear with distance (for example cm = 80 - raw / 10).",
        why: "The curve is roughly inverse (1/d), so a linear formula is badly wrong at both ends of the range.",
        fix: "Use a calibrated d = K / (raw - C) fit, a small lookup table, or simply compare raw against thresholds.",
      },
      {
        mistake: "No decoupling capacitor and sensor wires run next to motor wires.",
        why: "The pulsed LED current and motor noise appear as random jumps of many ADC counts, causing false detections.",
        fix: "Fit a 10 µF or larger capacitor at the sensor's Vcc-GND pins, twist the sensor wires, route them away from motor leads, and median-filter readings.",
      },
      {
        mistake: "Sampling the sensor every loop and expecting new information each time.",
        why: "The sensor only produces a new measurement roughly every 40 ms; faster sampling only repeats the old value plus noise.",
        fix: "Filter fast samples to reject noise, but design decisions around a ~40 ms update period.",
      },
    ],
    keyTakeaways: [
      "Sharp IR sensors measure distance by triangulation, giving an analog voltage that is high when close and low when far.",
      "The GP2Y0A21YK0F works over roughly 10-80 cm, which suits a 77 cm mini-sumo ring.",
      "The output is nonlinear (roughly 1/d) and ambiguous below about 10 cm - mount sensors recessed.",
      "Add a 10 µF+ capacitor at the sensor and filter readings (median, hysteresis).",
      "For sumo, thresholds on raw values are often more useful than converting to centimetres.",
    ],
    relatedComponents: ["Sharp GP2Y0A21YK0F", "Arduino Uno R3", "Electrolytic Capacitor", "HC-SR04"],
    youtubeSearch: "Sharp GP2Y0A21YK0F IR distance sensor Arduino tutorial",
    quiz: [
      {
        type: "identify-component",
        prompt:
          "A sensor has two round lenses side by side in a black plastic housing, a 3-wire connector (Vo, GND, Vcc) and gives an analog voltage that rises as an object approaches from 80 cm to about 10 cm. Which component is it?",
        options: ["HC-SR04 ultrasonic sensor", "TCRT5000 reflective sensor", "Sharp GP2Y0A21YK0F IR distance sensor", "Micro switch"],
        answerIndex: 2,
        explanation:
          "The two lenses (IR emitter and position detector), a single analog output and a 10-80 cm range describe the Sharp GP2Y0A21YK0F. The HC-SR04 also measures distance but has two metal ultrasonic transducers and four pins (Vcc, Trig, Echo, GND) and outputs a timed pulse, not an analog voltage. The TCRT5000 only works over a few millimetres.",
        difficulty: 1,
      },
      {
        type: "calculate",
        prompt:
          "A Sharp sensor is read with analogRead() on an Arduino Uno using the default 5 V reference. The reading is 410. What is the sensor's output voltage, to two decimal places?",
        options: ["0.41 V", "2.00 V", "4.10 V", "2.05 V"],
        answerIndex: 1,
        diagram: {
          kind: "formula",
          latexish: "V = raw × 5 / 1023",
          legend: { V: "voltage at the pin", raw: "10-bit ADC reading (0-1023)" },
        },
        explanation:
          "V = 410 x 5 / 1023 = 2050 / 1023 = 2.00 V. The 10-bit ADC maps 0-5 V onto 0-1023. Answering 0.41 V or 4.10 V treats the reading as if it were already in volts, and 2.05 V divides by 1000 instead of 1023.",
        difficulty: 1,
      },
      {
        type: "code-output",
        prompt: "What does this code print on an Arduino Uno?",
        code: `void setup() {
  Serial.begin(9600);
  int raw = 512;
  long mv = (long)raw * 5000 / 1023;
  Serial.println(mv);
}

void loop() {}`,
        options: ["2500", "2502.44", "4", "2502"],
        answerIndex: 3,
        explanation:
          "The (long) cast makes the multiplication 32-bit: 512 x 5000 = 2,560,000, and 2,560,000 / 1023 = 2502 remainder 454. Integer division discards the remainder, so 2502 is printed (no decimals, so 2502.44 is impossible). Without the cast, raw * 5000 would be calculated as a 16-bit int on the Uno and overflow, giving a nonsense small number such as 4 - which is why the cast matters.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt:
          "Your Sharp sensor is mounted at the very front of the robot. When the opponent is pushed right against your wedge (about 3 cm from the sensor), the robot suddenly decides the opponent has disappeared. Why?",
        options: [
          "The opponent is below the minimum range, where the output falls again and looks like a far object",
          "The sensor saturates at 5 V and the ADC wraps around to 0",
          "IR light cannot reflect from objects closer than 10 cm",
          "The Arduino ADC cannot read voltages above 2 V",
        ],
        answerIndex: 0,
        explanation:
          "Below roughly 10 cm the GP2Y0A21's output curve peaks and then decreases, so a very close object can give the same voltage as one much further away. The output never reaches 5 V and the ADC does not wrap - it simply reads a lower voltage. Fix it by recessing the sensor or latching the 'opponent present' state during a push.",
        difficulty: 2,
      },
      {
        type: "identify-pin",
        prompt:
          "The Sharp sensor's three wires are Vo (signal), GND and Vcc. Which Arduino Uno pin should the Vo wire connect to?",
        options: ["D2", "5V", "A0", "AREF"],
        answerIndex: 2,
        explanation:
          "Vo is an analog voltage, so it must go to an analog input (A0-A5) read with analogRead(). D2 is a digital pin and would only report HIGH or LOW. 5V is where Vcc connects, and AREF is the ADC reference pin - connecting a signal there would corrupt every analog reading.",
        difficulty: 1,
      },
    ],
  }),

  // ───────────────────────────── 15. Edge Detection ─────────────────────────────
  defineTopic("sumo", 15, {
    slug: "edge-detection",
    title: "Edge Detection",
    minutes: 12,
    summary:
      "Using downward-facing reflectance sensors to spot the white border of the black dohyo and escape before the robot drives itself out of the ring.",
    introduction:
      "In sumo, the fastest way to lose is to drive yourself out of the ring. The dohyo is black with a white border line, and reflectance sensors such as the TCRT5000 or a QTR array can tell those apart instantly. This topic covers how the sensors work, where to mount them, how to choose thresholds, and how to write an escape routine that reacts in milliseconds without freezing the rest of the program.",
    beginner:
      "Think of walking along a dark corridor with a torch pointed at the floor. On a dark carpet hardly any light bounces back; when the torch reaches a white tile, the floor suddenly looks bright. You do not need to know how far the tile is - only whether the floor is bright or dark.\n\nAn edge sensor is a tiny torch and eye pointed at the ring surface from a few millimetres above it. The 'torch' is an infrared LED you cannot see, and the 'eye' is a phototransistor that lets more current flow when more light hits it. The black dohyo absorbs most of the infrared, while the white border reflects a lot. So the sensor's output changes sharply the moment it crosses onto the white line.\n\nYour robot puts sensors at its front corners, ahead of the wheels, like the bumper of a car. As soon as one of them sees white, the program forgets everything else - even attacking - and backs away and turns toward the centre. The trick is to react fast enough: a robot moving at 1 metre per second travels 1 cm every 10 milliseconds, and the white border is only a few centimetres wide.",
    technical: [
      {
        heading: "Reflectance sensor circuit",
        body:
          "A TCRT5000 contains an IR LED (anode, cathode) and a phototransistor (collector, emitter). Typical discrete wiring:\n\n- LED: 5 V -> 220 Ω -> anode, cathode -> GND. With a forward voltage of roughly 1.2 V, I = (5 - 1.2) / 220 = about 17 mA - well inside the LED rating.\n- Phototransistor: collector -> 10 kΩ pull-up -> 5 V, emitter -> GND, and the collector node -> analog pin.\n\nOn black, little light returns, the transistor barely conducts and the pull-up holds the output near 5 V (high reading). On white, the transistor conducts and pulls the output low. So with this circuit WHITE = LOW reading. QTR-8A channels behave the same way (more reflection -> lower voltage). Many ready-made TCRT5000 modules add an LM393 comparator with a digital DO pin and a trim pot; their logic level for 'white' depends on the module, so always print values and check.",
      },
      {
        heading: "Mounting height, placement and reaction distance",
        body:
          "The TCRT5000 is designed for very short distances - its datasheet response peaks at about 2.5 mm and falls off quickly beyond roughly 10-15 mm. Mount it 2-5 mm above the surface, shielded from ambient light.\n\nPlace edge sensors at the front corners, ahead of the drive wheels. Reaction distance = speed x latency. Example: at 0.8 m/s with a 10 ms loop, the robot moves 0.8 x 0.010 = 8 mm before it even reacts, then needs more distance to stop. If the sensor is 30 mm ahead of the wheels, that margin covers detection plus braking. Rear sensors are worth adding because opponents push you backward.",
      },
      {
        heading: "Thresholds and calibration",
        body:
          "Measure each sensor on the black surface and on the white border, under competition lighting. Example readings: black = 880, white = 140. Threshold = (880 + 140) / 2 = 510. Readings below 510 mean white. Calibrate each sensor separately - two TCRT5000s can differ by hundreds of counts. If sunlight or stage lights shift readings, consider a reading taken with the LED off subtracted from one with it on (ambient cancellation), or shading the sensor in a short tube.",
      },
      {
        heading: "Non-blocking escape routine",
        body:
          "Edge handling must have the highest priority in the program. A typical escape: reverse for about 150-250 ms, then spin away from the side that saw the line for about 150-300 ms, then return to searching. Implement it with millis() timestamps and a state variable, not delay(), so the loop keeps checking the other edge sensor. If the opposite sensor also hits white while reversing (for example on a diagonal), the routine should update its direction rather than blindly finishing the timed move.",
      },
    ],
    workingPrinciple:
      "An IR LED illuminates the ring surface a few millimetres below the sensor. The phototransistor next to it conducts current in proportion to the reflected IR. Black paint absorbs most IR, so little current flows and the pull-up keeps the output high; the white border reflects strongly, the phototransistor conducts and the output is pulled low. The microcontroller compares each reading with a calibrated threshold halfway between black and white. When any edge sensor crosses the threshold, a high-priority escape state takes over the motors: reverse away from the edge and turn toward the ring centre, timed with millis().",
    diagrams: [
      {
        kind: "circuit",
        nodes: [
          { id: "v5", label: "5V", x: 40, y: 30 },
          { id: "r220", label: "220 Ω", x: 140, y: 30 },
          { id: "led", label: "TCRT5000 LED (A-K)", x: 240, y: 30 },
          { id: "r10k", label: "10 kΩ pull-up", x: 140, y: 130 },
          { id: "pt", label: "Phototransistor (C-E)", x: 240, y: 130 },
          { id: "a0", label: "Uno A0", x: 340, y: 130 },
          { id: "gnd", label: "GND", x: 340, y: 200 },
        ],
        edges: [
          { from: "v5", to: "r220" },
          { from: "r220", to: "led", label: "anode" },
          { from: "led", to: "gnd", label: "cathode" },
          { from: "v5", to: "r10k" },
          { from: "r10k", to: "pt", label: "collector" },
          { from: "pt", to: "a0", label: "signal" },
          { from: "pt", to: "gnd", label: "emitter" },
        ],
      },
      {
        kind: "flow",
        steps: [
          "Read front-left, front-right (and rear) edge sensors",
          "Any reading below its threshold? If no, continue strategy",
          "If yes: enter ESCAPE, remember which side saw white, note start time",
          "Reverse at full power for ~200 ms (checked with millis())",
          "Spin away from that side for ~200 ms",
          "Return to SEARCH",
        ],
      },
    ],
    examples: [
      {
        title: "Two-sensor calibration print-out",
        body:
          "Upload, place the robot on black, then slide the sensors over the white border. Note the lowest white and highest black values for each sensor and set thresholds halfway.",
        code: `const int EDGE_L = A0;
const int EDGE_R = A1;

void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.print("L=");
  Serial.print(analogRead(EDGE_L));
  Serial.print("  R=");
  Serial.println(analogRead(EDGE_R));
  delay(100);
}`,
      },
      {
        title: "Non-blocking edge escape with a TB6612FNG",
        body:
          "The escape state machine reverses, then spins away from the side that saw white. Because it uses millis(), the loop never stops reading sensors. drive(left, right) takes speeds from -255 to 255.",
        code: `const int PWMA = 5, AIN1 = 7, AIN2 = 8;    // left motor
const int PWMB = 6, BIN1 = 9, BIN2 = 10;   // right motor
const int STBY = 4;
const int EDGE_L = A0, EDGE_R = A1;
const int TH_L = 510, TH_R = 495;          // from calibration (white is LOW)

enum State { SEARCH, REVERSE, SPIN };
State state = SEARCH;
unsigned long stateStart = 0;
int spinDir = 1;  // +1 = spin right, -1 = spin left

void setMotor(int pwmPin, int in1, int in2, int speed) {
  speed = constrain(speed, -255, 255);
  if (speed >= 0) {
    digitalWrite(in1, HIGH);
    digitalWrite(in2, LOW);
  } else {
    digitalWrite(in1, LOW);
    digitalWrite(in2, HIGH);
    speed = -speed;
  }
  analogWrite(pwmPin, speed);
}

void drive(int left, int right) {
  setMotor(PWMA, AIN1, AIN2, left);
  setMotor(PWMB, BIN1, BIN2, right);
}

void setup() {
  int outs[] = {PWMA, AIN1, AIN2, PWMB, BIN1, BIN2, STBY};
  for (int i = 0; i < 7; i++) pinMode(outs[i], OUTPUT);
  digitalWrite(STBY, HIGH);
}

void loop() {
  bool whiteL = analogRead(EDGE_L) < TH_L;
  bool whiteR = analogRead(EDGE_R) < TH_R;
  unsigned long now = millis();

  if (whiteL || whiteR) {
    if (state != REVERSE) stateStart = now;
    state = REVERSE;
    spinDir = whiteL ? 1 : -1;  // left saw white -> spin right
  }

  switch (state) {
    case REVERSE:
      drive(-255, -255);
      if (now - stateStart >= 200) { state = SPIN; stateStart = now; }
      break;
    case SPIN:
      drive(200 * spinDir, -200 * spinDir);
      if (now - stateStart >= 200) state = SEARCH;
      break;
    case SEARCH:
      drive(120, -120);
      break;
  }
}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Mounting edge sensors behind the drive wheels or 2 cm above the floor.",
        why: "Behind the wheels the robot is already over the edge when it reacts; at 2 cm height the TCRT5000 barely sees any contrast.",
        fix: "Mount sensors at the front (and rear) corners, ahead of the wheels, 2-5 mm above the surface.",
      },
      {
        mistake: "Using delay() inside the escape move.",
        why: "During delay(800) nothing else is read - if the robot is pushed or turns onto another part of the line, it cannot respond and may fall out.",
        fix: "Write the escape as a millis()-timed state machine so sensors are checked every loop.",
      },
      {
        mistake: "Assuming white gives a HIGH reading.",
        why: "With the usual pull-up circuit, more reflection pulls the output LOW, so a 'greater than' test triggers on black and the robot escapes from the whole ring.",
        fix: "Print the raw values on black and white first, then write the comparison to match your hardware.",
      },
      {
        mistake: "One shared threshold for all sensors, set in a dark workshop.",
        why: "Sensors differ, and bright venue lighting adds ambient IR that shifts readings.",
        fix: "Calibrate each sensor on the real dohyo under venue lighting, and shield sensors from side light.",
      },
    ],
    keyTakeaways: [
      "The dohyo is black with a white border; reflectance sensors see the border as a sharp change in IR reflection.",
      "With a pull-up circuit, white (more reflection) gives a LOW reading and black a HIGH reading.",
      "Mount sensors 2-5 mm above the surface, ahead of the wheels, at the front corners plus the rear if possible.",
      "Set each threshold halfway between that sensor's black and white readings.",
      "Edge escape is the highest-priority behaviour and must be non-blocking.",
    ],
    relatedComponents: ["TCRT5000", "QTR-8A", "Arduino Uno R3", "TB6612FNG"],
    youtubeSearch: "sumo robot edge detection TCRT5000 white line Arduino",
    quiz: [
      {
        type: "predict-movement",
        prompt:
          "Using the escape routine from this topic (drive(left, right) with positive = forward), only the FRONT-LEFT sensor sees white. After reversing, the robot runs drive(200 * spinDir, -200 * spinDir) with spinDir = 1. What does the robot do?",
        code: `spinDir = whiteL ? 1 : -1;
// ... after 200 ms of drive(-255, -255) ...
drive(200 * spinDir, -200 * spinDir);`,
        options: [
          "Spins left (anticlockwise seen from above), turning toward the line",
          "Drives straight forward back onto the line",
          "Spins right (clockwise seen from above), turning away from the left edge",
          "Stops, because both motors cancel out",
        ],
        answerIndex: 2,
        explanation:
          "whiteL is true, so spinDir = 1 and the call becomes drive(200, -200): left wheel forward, right wheel backward. That rotates the robot clockwise in place - a right turn, away from the edge on the left. Opposite wheel directions do not 'cancel'; they create rotation. A left spin would need the left wheel backward.",
        difficulty: 2,
      },
      {
        type: "debug-code",
        prompt:
          "The edge sensor uses the standard pull-up circuit (black reads about 850, white about 120). The robot keeps escaping even in the middle of the black ring and never reacts to the border. What is the bug?",
        code: `const int EDGE_PIN = A0;
const int THRESHOLD = 500;

void escape() {
  // reverse and turn (omitted)
}

void setup() {}

void loop() {
  int v = analogRead(EDGE_PIN);
  if (v > THRESHOLD) {
    escape();
  }
}`,
        options: [
          "THRESHOLD should be 1023",
          "The comparison is reversed: white gives a LOW reading, so it should be v < THRESHOLD",
          "analogRead() cannot be used on A0",
          "escape() must be declared after loop()",
        ],
        answerIndex: 1,
        explanation:
          "On black the reading is about 850, which is greater than 500, so escape() runs all the time; on white (120) it does not. The test must be v < THRESHOLD. A threshold of 1023 would never trigger at all, A0 is a perfectly normal analog input, and in an Arduino sketch a function defined before loop() is fine.",
        difficulty: 2,
      },
      {
        type: "identify-pin",
        prompt:
          "In the discrete TCRT5000 circuit (LED with 220 Ω to 5 V, phototransistor with a 10 kΩ pull-up), which TCRT5000 pin is wired to the Arduino analog input?",
        options: ["LED anode", "LED cathode", "Phototransistor emitter", "Phototransistor collector"],
        answerIndex: 3,
        explanation:
          "The collector sits between the 10 kΩ pull-up and the transistor, so its voltage swings from near 5 V (black, transistor off) to low (white, transistor on). The emitter is tied to GND, so it never changes. The LED pins only power the emitter side and carry no reflectance information.",
        difficulty: 2,
      },
      {
        type: "find-wrong-connection",
        prompt: "This edge-sensor wiring has one dangerous mistake. Which connection is wrong?",
        diagram: {
          kind: "circuit",
          nodes: [
            { id: "v5", label: "5V", x: 40, y: 30 },
            { id: "led", label: "TCRT5000 LED anode", x: 220, y: 30 },
            { id: "k", label: "LED cathode", x: 220, y: 90 },
            { id: "r10k", label: "10 kΩ", x: 120, y: 150 },
            { id: "c", label: "Collector", x: 220, y: 150 },
            { id: "a0", label: "Uno A0", x: 340, y: 150 },
            { id: "gnd", label: "GND", x: 340, y: 210 },
          ],
          edges: [
            { from: "v5", to: "led", label: "direct wire", wrong: true, color: "red" },
            { from: "k", to: "gnd" },
            { from: "v5", to: "r10k" },
            { from: "r10k", to: "c" },
            { from: "c", to: "a0" },
          ],
        },
        options: [
          "5V wired straight to the LED anode with no current-limiting resistor",
          "10 kΩ pull-up between 5V and the collector",
          "Collector connected to A0",
          "LED cathode connected to GND",
        ],
        answerIndex: 0,
        explanation:
          "An LED has only about 1.2 V across it, so connecting it straight to 5 V leaves nothing to limit the current - it will draw far too much and burn out (and may overload the 5 V rail). A series resistor such as 220 Ω limits it to about 17 mA. The pull-up, collector-to-A0 and cathode-to-GND connections are all correct.",
        difficulty: 1,
      },
    ],
  }),

  // ───────────────────────────── 16. Bumper Switches ─────────────────────────────
  defineTopic("sumo", 16, {
    slug: "bumper-switches",
    title: "Bumper Switches",
    minutes: 10,
    summary:
      "Using micro switches as contact sensors, wiring them with INPUT_PULLUP and debouncing them so a sumo robot knows exactly when and where it has been hit.",
    introduction:
      "Distance sensors tell you where the opponent might be; a bumper switch tells you for certain that you are touching something. Micro switches are cheap, simple and fast, which makes them a great extra sensor for sumo robots - especially to detect side and rear hits. This topic covers how they are wired, why the internal pull-up resistor matters, what contact bounce is and how to debounce in software without blocking your robot.",
    beginner:
      "A bumper switch is like a doorbell button. When nothing touches it, the circuit is open and nothing happens. When something presses it, two metal contacts touch and current can flow. The Arduino just has to notice whether the button is pressed or not.\n\nThere is a catch. If you connect a switch to an input pin and leave it unpressed, the pin is connected to nothing - it 'floats' and can read HIGH or LOW randomly, like a radio picking up static. The fix is a pull-up resistor that gently holds the pin HIGH when the switch is open. The Arduino has one built in: pinMode(pin, INPUT_PULLUP). Then you wire the switch between the pin and GND. Not pressed = HIGH, pressed = LOW. It feels backwards at first, but it is the standard way.\n\nThe second catch is 'bounce'. Real metal contacts do not close cleanly - they rattle for a few milliseconds, like a ball bouncing before it settles. The Arduino is so fast that one press can look like several. Debouncing means waiting until the reading has been stable for a short time before believing it.",
    technical: [
      {
        heading: "Micro switch pins and INPUT_PULLUP wiring",
        body:
          "A typical lever micro switch has three terminals: COM (common), NO (normally open) and NC (normally closed). For a bumper, wire COM -> GND and NO -> a digital pin configured with pinMode(pin, INPUT_PULLUP).\n\n- Released: NO is open, the internal pull-up (about 20-50 kΩ on the ATmega328P) holds the pin HIGH.\n- Pressed: NO connects to COM, the pin is pulled to GND and reads LOW.\n- Current when pressed: about 5 V / 35 kΩ = roughly 0.14 mA - negligible.\n\nNever wire the switch between 5 V and the pin while also using INPUT_PULLUP: the pin would read HIGH whether pressed or not. Avoid D0 and D1 (USB serial). Long wires to switches pick up motor noise; a 100 nF capacitor from pin to GND near the Arduino helps, and the switch wiring should be twisted with its ground return.",
      },
      {
        heading: "Contact bounce and debouncing",
        body:
          "When mechanical contacts close they bounce open and closed several times over a period that is typically a few milliseconds (it varies by switch and can be longer for worn or cheap ones). The Uno's loop can sample hundreds of times in that window, so a single press may show up as several HIGH-LOW transitions.\n\nSoftware debounce with millis(): remember the last raw reading and the time it last changed. Only accept a new stable state when the raw reading has stayed the same for a debounce interval such as 10-20 ms. Larger intervals (hundreds of ms) make the robot slow to react and can miss a quick second hit. Hardware debounce (RC filter plus a Schmitt-trigger input) is an alternative but rarely needed for robot bumpers.",
      },
      {
        heading: "Interrupts and placement in a sumo robot",
        body:
          "On the Uno only D2 and D3 support attachInterrupt() (via digitalPinToInterrupt()). An interrupt can set a flag the instant a bumper closes, but the main loop should still do the debouncing and decision making - keep interrupt routines tiny and mark shared flags volatile. In practice, a non-blocking loop running every millisecond or so is fast enough for bumpers.\n\nPlacement: side and rear bumpers are the most useful, because they detect attacks that the front distance sensors cannot see. Give each switch its own pin so the code knows which side was hit and can spin to face the attacker. Use the lever or a light plate to spread the contact area, and make sure a hard hit cannot break the switch body - mount it so the lever bottoms out against the chassis.",
      },
    ],
    workingPrinciple:
      "The internal pull-up resistor connects the input pin weakly to 5 V, so an open switch reads HIGH. When a collision presses the lever, the normally-open contact connects the pin to GND through COM and the pin reads LOW. Because the contacts bounce for a few milliseconds, the program accepts a change only after the raw reading has stayed constant for a debounce interval measured with millis(). The debounced state, together with which switch triggered, tells the strategy code that a collision has happened and from which direction.",
    diagrams: [
      {
        kind: "circuit",
        nodes: [
          { id: "v5", label: "5V (inside chip)", x: 60, y: 30 },
          { id: "rpu", label: "Internal pull-up ~20-50 kΩ", x: 60, y: 100 },
          { id: "d2", label: "Uno D2 (INPUT_PULLUP)", x: 220, y: 100 },
          { id: "no", label: "Switch NO", x: 340, y: 100 },
          { id: "com", label: "Switch COM", x: 340, y: 180 },
          { id: "gnd", label: "GND", x: 220, y: 180 },
        ],
        edges: [
          { from: "v5", to: "rpu" },
          { from: "rpu", to: "d2" },
          { from: "d2", to: "no", label: "wire" },
          { from: "no", to: "com", label: "closes when pressed" },
          { from: "com", to: "gnd", label: "wire" },
        ],
      },
      {
        kind: "signal",
        title: "Contact bounce on one press (illustrative)",
        xLabel: "Time (ms)",
        yLabel: "Pin level (1 = HIGH)",
        series: [
          {
            label: "Raw pin",
            points: [[0, 1], [1, 1], [1.2, 0], [1.6, 1], [2.0, 0], [2.3, 1], [2.6, 0], [10, 0], [20, 0]],
          },
          {
            label: "Debounced (15 ms)",
            points: [[0, 1], [17.6, 1], [17.6, 0], [20, 0]],
          },
        ],
      },
    ],
    examples: [
      {
        title: "Debounced bumper with millis()",
        body:
          "Accepts a new state only after the raw reading has been unchanged for 15 ms. Prints once per real press.",
        code: `const int BUMP_PIN = 2;
const unsigned long DEBOUNCE_MS = 15;

int lastRaw = HIGH;
int stableState = HIGH;
unsigned long lastChange = 0;

void setup() {
  pinMode(BUMP_PIN, INPUT_PULLUP);
  Serial.begin(9600);
}

void loop() {
  int raw = digitalRead(BUMP_PIN);
  if (raw != lastRaw) {
    lastRaw = raw;
    lastChange = millis();
  }
  if (millis() - lastChange >= DEBOUNCE_MS && raw != stableState) {
    stableState = raw;
    if (stableState == LOW) {
      Serial.println("HIT");
    } else {
      Serial.println("released");
    }
  }
}`,
      },
      {
        title: "Three bumpers telling the robot where it was hit",
        body:
          "Left, right and rear micro switches on separate pins. The robot decides which way to spin to face the attacker. Debounce is kept simple here by requiring two equal readings 10 ms apart.",
        code: `const int BUMP_LEFT = 2;
const int BUMP_RIGHT = 3;
const int BUMP_REAR = 11;

bool pressed(int pin) {
  if (digitalRead(pin) != LOW) return false;
  delay(10);                         // short confirm, 10 ms
  return digitalRead(pin) == LOW;
}

void setup() {
  pinMode(BUMP_LEFT, INPUT_PULLUP);
  pinMode(BUMP_RIGHT, INPUT_PULLUP);
  pinMode(BUMP_REAR, INPUT_PULLUP);
  Serial.begin(9600);
}

void loop() {
  if (pressed(BUMP_LEFT)) Serial.println("Hit on LEFT: spin left to face");
  else if (pressed(BUMP_RIGHT)) Serial.println("Hit on RIGHT: spin right to face");
  else if (pressed(BUMP_REAR)) Serial.println("Hit from REAR: spin 180");
  delay(20);
}`,
      },
    ],
    commonMistakes: [
      {
        mistake: "Using pinMode(pin, INPUT) with the switch between the pin and GND.",
        why: "With no pull-up the open switch leaves the pin floating, so it reads random HIGH/LOW values and the robot reacts to phantom hits.",
        fix: "Use INPUT_PULLUP (or an external 10 kΩ pull-up) so the open state is a solid HIGH.",
      },
      {
        mistake: "Expecting HIGH when pressed.",
        why: "With INPUT_PULLUP and the switch to GND, pressed = LOW. Code testing for HIGH reacts when nothing is touching.",
        fix: "Write the logic as if (digitalRead(pin) == LOW) for 'pressed', and name it clearly in a helper function.",
      },
      {
        mistake: "Counting presses without debouncing.",
        why: "Contact bounce creates several transitions per press, so counters and toggles jump by more than one.",
        fix: "Accept a new state only after it has been stable for 10-20 ms using millis().",
      },
      {
        mistake: "Wiring all bumpers to one pin.",
        why: "The robot knows it was hit but not where, so it cannot turn to face the attacker.",
        fix: "Give each bumper its own input pin (D2 and D3 if you want interrupts).",
      },
    ],
    keyTakeaways: [
      "Wire micro switches COM -> GND and NO -> input pin, with pinMode(pin, INPUT_PULLUP).",
      "With a pull-up, released reads HIGH and pressed reads LOW.",
      "Mechanical contacts bounce for a few milliseconds; debounce with a 10-20 ms stability check.",
      "On the Uno only D2 and D3 support attachInterrupt().",
      "Separate side and rear bumpers let the robot know where an attack came from.",
    ],
    relatedComponents: ["Micro Switch", "Arduino Uno R3", "Ceramic Capacitor"],
    youtubeSearch: "Arduino INPUT_PULLUP micro switch debounce millis tutorial",
    quiz: [
      {
        type: "code-output",
        prompt:
          "The array holds raw readings of a bumper pin sampled every 0.5 ms during ONE physical press (1 = HIGH, 0 = LOW, INPUT_PULLUP). What does the code print?",
        code: `void setup() {
  Serial.begin(9600);
  int samples[8] = {1, 0, 1, 0, 0, 0, 0, 1};
  int edges = 0;
  int last = 1;
  for (int i = 0; i < 8; i++) {
    if (samples[i] == 0 && last == 1) edges++;
    last = samples[i];
  }
  Serial.println(edges);
}

void loop() {}`,
        options: ["1", "3", "2", "5"],
        answerIndex: 2,
        explanation:
          "A falling edge is counted when the current sample is 0 and the previous was 1. That happens at index 1 (1 -> 0) and index 3 (1 -> 0). The run of zeros at indexes 4-6 is not a new edge because last is already 0, and index 7 is a rising edge. So 2 is printed - one press counted twice because of bounce. Answering 5 counts the number of zeros, not the edges.",
        difficulty: 2,
      },
      {
        type: "find-wrong-connection",
        prompt:
          "The code uses pinMode(7, INPUT_PULLUP) and treats LOW as 'pressed'. The bumper never seems to trigger. Which connection is wrong?",
        diagram: {
          kind: "circuit",
          nodes: [
            { id: "v5", label: "Uno 5V", x: 60, y: 40 },
            { id: "com", label: "Switch COM", x: 200, y: 40 },
            { id: "no", label: "Switch NO", x: 200, y: 140 },
            { id: "d7", label: "Uno D7", x: 340, y: 140 },
          ],
          edges: [
            { from: "v5", to: "com", wrong: true, color: "red" },
            { from: "no", to: "d7" },
          ],
        },
        options: [
          "NO wired to D7",
          "COM wired to 5V instead of GND",
          "Using NO instead of NC",
          "D7 cannot be used as an input",
        ],
        answerIndex: 1,
        explanation:
          "With INPUT_PULLUP the pin already sits at HIGH. Pressing a switch that connects it to 5V just keeps it HIGH, so the reading never changes. COM must go to GND so a press pulls the pin LOW. Using NO is correct for a bumper (open until hit), and D7 is a normal digital input.",
        difficulty: 2,
      },
      {
        type: "predict-circuit",
        prompt:
          "A bumper switch is wired COM -> GND and NO -> D4, but the code uses pinMode(4, INPUT) (no pull-up, no external resistor). The switch is NOT pressed. What will digitalRead(4) return?",
        options: [
          "Always HIGH",
          "Always LOW",
          "Unpredictable - the pin floats and may change between HIGH and LOW",
          "The value 512",
        ],
        answerIndex: 2,
        explanation:
          "With the switch open, D4 is connected to nothing; a high-impedance CMOS input picks up stray charge and noise, so it can read either level and change over time. It is not guaranteed HIGH - that only happens with a pull-up. digitalRead() never returns 512; it returns HIGH or LOW. When pressed it would read LOW reliably, which hides the bug during simple tests.",
        difficulty: 2,
      },
      {
        type: "mcq",
        prompt:
          "A student sets the bumper debounce interval to 500 ms 'to be safe'. What is the main problem?",
        options: [
          "The robot reacts up to half a second late and can miss a quick second hit",
          "The switch will be damaged by being read too slowly",
          "millis() overflows after 500 ms",
          "INPUT_PULLUP stops working with long debounce times",
        ],
        answerIndex: 0,
        explanation:
          "Bounce typically lasts only a few milliseconds, so 10-20 ms is enough. A 500 ms window means a hit is only confirmed half a second later - in sumo the opponent can push you a long way in that time - and short events can be ignored entirely. Reading a switch cannot damage it, millis() only overflows after about 49.7 days, and the pull-up is unaffected by software timing.",
        difficulty: 1,
      },
      {
        type: "identify-pin",
        prompt:
          "You want a bumper to trigger an external interrupt with attachInterrupt(digitalPinToInterrupt(pin), onHit, FALLING) on an Arduino Uno. Which of these pins can you use?",
        options: ["D2", "D7", "A0", "D13"],
        answerIndex: 0,
        explanation:
          "The Uno's external interrupts INT0 and INT1 are on D2 and D3 only, so D2 works. D7, A0 and D13 can still be read with digitalRead() (and support pin-change interrupts through lower-level registers), but attachInterrupt() does not support them on the Uno.",
        difficulty: 1,
      },
    ],
  }),
];
