/**
 * Starter templates. Students can write their own code from scratch — templates are optional.
 * Pin numbers in each template are placeholders; Code Studio's pin check compares them with the circuit.
 */
export interface CodeTemplate {
  id: string;
  title: string;
  description: string;
  competition: "race" | "line" | "sumo" | "any";
  code: string;
}

const DRIVE_FUNCS = `// ---- motor helpers (L298N style: ENx = speed PWM, INx = direction) ----
void setMotors(int left, int right) {
  left = constrain(left, -255, 255);
  right = constrain(right, -255, 255);
  digitalWrite(IN1, left >= 0 ? HIGH : LOW);
  digitalWrite(IN2, left >= 0 ? LOW : HIGH);
  digitalWrite(IN3, right >= 0 ? HIGH : LOW);
  digitalWrite(IN4, right >= 0 ? LOW : HIGH);
  analogWrite(ENA, abs(left));
  analogWrite(ENB, abs(right));
}

void stopMotors() {
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
}`;

const PINS = `#define ENA 5   // left motor speed  (PWM pin)
#define IN1 7
#define IN2 8
#define IN3 9
#define IN4 10
#define ENB 6   // right motor speed (PWM pin)`;

const SETUP_PINS = `  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  pinMode(ENB, OUTPUT);`;

export const CODE_TEMPLATES: CodeTemplate[] = [
  {
    id: "motor-test",
    title: "Motor Testing",
    description: "Runs each motor forward and backward so you can check wiring and direction.",
    competition: "any",
    code: `// MOTOR TEST — watch each wheel: forward, backward, then stop.
${PINS}

${DRIVE_FUNCS}

void setup() {
${SETUP_PINS}
  Serial.begin(9600);
  Serial.println("Motor test starting");
}

void loop() {
  Serial.println("Both forward");
  setMotors(180, 180);
  delay(1500);
  Serial.println("Both backward");
  setMotors(-180, -180);
  delay(1500);
  Serial.println("Spin left");
  setMotors(-150, 150);
  delay(1000);
  stopMotors();
  delay(1000);
}
`,
  },
  {
    id: "robo-race",
    title: "Robo Race (timed autonomous run)",
    description: "Drives forward and makes timed turns — a starting point for racing logic.",
    competition: "race",
    code: `// ROBO RACE — simple timed driving. Replace with sensor-based logic as you improve!
${PINS}

${DRIVE_FUNCS}

int speed = 200;

void setup() {
${SETUP_PINS}
}

void loop() {
  setMotors(speed, speed);   // straight
  delay(2000);
  setMotors(speed, speed / 3); // gentle right
  delay(900);
}
`,
  },
  {
    id: "line-basic",
    title: "Line Following (basic left/right)",
    description: "Two-sensor bang-bang control: turn towards whichever side sees the line.",
    competition: "line",
    code: `// BASIC LINE FOLLOWER — digital sensors read HIGH over the black line.
${PINS}
#define LEFT_SENSOR  A1
#define RIGHT_SENSOR A3

${DRIVE_FUNCS}

void setup() {
${SETUP_PINS}
  pinMode(LEFT_SENSOR, INPUT);
  pinMode(RIGHT_SENSOR, INPUT);
}

void loop() {
  int left = digitalRead(LEFT_SENSOR);
  int right = digitalRead(RIGHT_SENSOR);
  if (left == HIGH && right == LOW) {
    setMotors(40, 170);       // line is on the left → turn left
  } else if (right == HIGH && left == LOW) {
    setMotors(170, 40);       // line is on the right → turn right
  } else {
    setMotors(140, 140);      // centred (or lost) → go straight
  }
}
`,
  },
  {
    id: "line-pid",
    title: "PID Line Following (5-sensor array)",
    description: "Weighted error from a 5-channel array with PD control and lost-line recovery.",
    competition: "line",
    code: `// PID LINE FOLLOWER — 5 digital sensors, S1 (left) ... S5 (right), HIGH = black line.
${PINS}

const int sensorPins[5] = {A0, A1, A2, A3, A4};
int baseSpeed = 150;
float Kp = 45.0;
float Kd = 30.0;
int lastError = 0;

${DRIVE_FUNCS}

void setup() {
${SETUP_PINS}
  for (int i = 0; i < 5; i++) {
    pinMode(sensorPins[i], INPUT);
  }
  Serial.begin(9600);
}

void loop() {
  int sum = 0;
  int weighted = 0;
  for (int i = 0; i < 5; i++) {
    int s = digitalRead(sensorPins[i]);
    sum += s;
    weighted += s * (i - 2);    // -2 (far left) ... +2 (far right)
  }

  int error;
  if (sum == 0) {
    // lost the line: keep turning towards the side where we last saw it
    error = lastError > 0 ? 4 : -4;
  } else {
    error = (weighted * 2) / sum; // -4 ... +4
  }

  int correction = Kp * error + Kd * (error - lastError);
  lastError = error;
  setMotors(baseSpeed + correction, baseSpeed - correction);
  delay(5);
}
`,
  },
  {
    id: "sumo",
    title: "Sumo Robot (search · attack · edge escape)",
    description: "HC-SR04 opponent search with two TCRT5000 edge sensors and the 5-second start delay.",
    competition: "sumo",
    code: `// SUMO — TB6612FNG driver, HC-SR04 on D11/D12, edge sensors (TCRT5000 D0) on D2/D3.
#define PWMA 5
#define AIN1 7
#define AIN2 8
#define PWMB 6
#define BIN1 9
#define BIN2 10
#define STBY 4
#define TRIG 11
#define ECHO 12
#define EDGE_LEFT 2
#define EDGE_RIGHT 3

void drive(int left, int right) {
  left = constrain(left, -255, 255);
  right = constrain(right, -255, 255);
  digitalWrite(AIN1, left >= 0 ? HIGH : LOW);
  digitalWrite(AIN2, left >= 0 ? LOW : HIGH);
  digitalWrite(BIN1, right >= 0 ? HIGH : LOW);
  digitalWrite(BIN2, right >= 0 ? LOW : HIGH);
  analogWrite(PWMA, abs(left));
  analogWrite(PWMB, abs(right));
}

long distanceCm() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 30000);
  if (us == 0) return 999;
  return us / 58;
}

void setup() {
  pinMode(PWMA, OUTPUT); pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(PWMB, OUTPUT); pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  pinMode(STBY, OUTPUT);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  pinMode(EDGE_LEFT, INPUT);
  pinMode(EDGE_RIGHT, INPUT);
  digitalWrite(STBY, HIGH);
  delay(5000);              // mandatory start delay in most sumo rules
}

void loop() {
  // TCRT5000 module: D0 is LOW over the white border
  if (digitalRead(EDGE_LEFT) == LOW || digitalRead(EDGE_RIGHT) == LOW) {
    drive(-220, -220);
    delay(250);
    drive(200, -200);
    delay(300);
    return;
  }
  long d = distanceCm();
  if (d < 40) {
    drive(255, 255);        // attack!
  } else {
    drive(150, -150);       // search: spin
  }
}
`,
  },
  {
    id: "bluetooth",
    title: "Manual Bluetooth Control",
    description: "Reads F/B/L/R/S commands from an HC-05/HC-06 on the hardware serial port. In the simulator, WASD sends these characters.",
    competition: "any",
    code: `// BLUETOOTH RC — HC-05 TXD → Arduino RX (D0). Commands: F B L R S
${PINS}

${DRIVE_FUNCS}

int speed = 200;

void setup() {
${SETUP_PINS}
  Serial.begin(9600);
}

void loop() {
  if (Serial.available() > 0) {
    char c = Serial.read();
    if (c == 'F') setMotors(speed, speed);
    else if (c == 'B') setMotors(-speed, -speed);
    else if (c == 'L') setMotors(-speed / 2, speed / 2);
    else if (c == 'R') setMotors(speed / 2, -speed / 2);
    else if (c == 'S') stopMotors();
  }
}
`,
  },
  {
    id: "sensor-test",
    title: "Sensor Testing",
    description: "Prints analog and digital readings from A0–A4 to the Serial monitor.",
    competition: "any",
    code: `// SENSOR TEST — open the Serial monitor in the Simulation Arena.
void setup() {
  Serial.begin(9600);
}

void loop() {
  for (int i = 0; i < 5; i++) {
    Serial.print(analogRead(A0 + i));
    Serial.print("\\t");
  }
  Serial.println();
  delay(200);
}
`,
  },
  {
    id: "encoder-speed",
    title: "Encoder-Based Speed Control",
    description: "Counts encoder pulses with an interrupt and adjusts PWM to hold a target speed (P control).",
    competition: "race",
    code: `// ENCODER SPEED CONTROL — encoder channel A on D2 (interrupt pin).
${PINS}
#define ENC_A 2

volatile long ticks = 0;
long lastTicks = 0;
unsigned long lastTime = 0;
int pwm = 120;
int targetTicksPer100ms = 40;   // tune for your encoder (counts per rev × rev/s ÷ 10)

void onTick() {
  ticks++;
}

${DRIVE_FUNCS}

void setup() {
${SETUP_PINS}
  pinMode(ENC_A, INPUT);
  attachInterrupt(digitalPinToInterrupt(ENC_A), onTick, RISING);
  Serial.begin(9600);
}

void loop() {
  if (millis() - lastTime >= 100) {
    noInterrupts();
    long now = ticks;
    interrupts();
    long measured = now - lastTicks;
    lastTicks = now;
    lastTime = millis();
    int error = targetTicksPer100ms - measured;
    pwm = constrain(pwm + error * 2, 0, 255);
    Serial.print("ticks/100ms=");
    Serial.print(measured);
    Serial.print(" pwm=");
    Serial.println(pwm);
  }
  setMotors(pwm, pwm);
}
`,
  },
];
