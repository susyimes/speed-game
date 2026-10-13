// HUD and design values are km/h; physics and track geometry use metres/second.
const kmh=(value:number)=>value/3.6;
export const SPEED={
  normal:kmh(600),absolute:kmh(800),start:kmh(90),minimum:kmh(45),recoveryFloor:kmh(60),
  cruiseCap:kmh(600),sonicMin:kmh(560),sonicCap:kmh(600),
  boost:kmh(750),hermesDash:kmh(800),glide:kmh(730),
  railMin:kmh(560),railCap:kmh(600),railBurst:kmh(760),fireStep:kmh(700),
  pad:kmh(580),padBurst:kmh(650),lampBurst:kmh(720),carpet:kmh(700),
  loopMin:kmh(300),loopExit:kmh(600),
  runAcceleration:kmh(70),burstAcceleration:kmh(260),padAcceleration:kmh(180),
  accelerationBlend:.24,
  // Ease the ceiling back from 800 to 600 over at most 0.8s.
  limitReturnPerSecond:kmh(250),
};
export const COLLISIONS={
  box:{label:'木箱擦碰',retain:.75,energy:12,recovery:.30,grace:.50,color:0xffd17a,tone:210},
  spikes:{label:'踩中尖刺',retain:.55,energy:30,recovery:.70,grace:.90,color:0xff9b54,tone:140},
  gate:{label:'栅栏阻挡',retain:.45,energy:38,recovery:.90,grace:1.05,color:0xff8158,tone:105},
  pendulum:{label:'摆锤重击',retain:.30,energy:48,recovery:1.10,grace:1.25,color:0xff5c61,tone:70},
} as const;
export type CollisionType=keyof typeof COLLISIONS;
