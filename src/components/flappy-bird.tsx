import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

// ------- Game tuning -------
const BIRD_W = 42;
const BIRD_H = 32;
const GRAVITY = 0.55;
const JUMP_FORCE = -9.2;
const PIPE_WIDTH = 64;
const PIPE_GAP = 170;
const PIPE_SPEED = 2.8;
const PIPE_SPAWN_INTERVAL = 1700;
const GROUND_HEIGHT = 90;

// ------- Colors -------
const SKY_TOP = "#4ec0ca";
const SKY_BOTTOM = "#bee6f0";
const GROUND_GRASS = "#73bf2e";
const GROUND_DIRT = "#dec468";
const GROUND_DIRT_DARK = "#c9a94e";
const PIPE_GREEN = "#73bf2e";
const PIPE_GREEN_LIGHT = "#8fd14f";
const PIPE_GREEN_DARK = "#568a23";
const PIPE_BORDER = "#3d6b14";

type Pipe = { id: number; x: number; gapY: number; scored: boolean };
type GameState = "menu" | "playing" | "gameover";

export default function FlappyBird() {
  const { width: SW, height: SH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const GAME_H = SH - GROUND_HEIGHT;
  const BIRD_X = SW * 0.25;

  const [gameState, setGameState] = useState<GameState>("menu");
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [birdTop, setBirdTop] = useState(GAME_H * 0.42);
  const [birdRot, setBirdRot] = useState(0);
  const [groundX, setGroundX] = useState(0);

  // Refs for mutable game state
  const birdYRef = useRef(GAME_H * 0.42);
  const birdVelRef = useRef(0);
  const birdRotRef = useRef(0);
  const pipesRef = useRef<Pipe[]>([]);
  const scoreRef = useRef(0);
  const gsRef = useRef<GameState>("menu");
  const lastSpawnRef = useRef(0);
  const pipeIdRef = useRef(0);
  const groundXRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);

  // Idle bob for menu
  const idleBob = useSharedValue(0);
  useEffect(() => {
    if (gameState === "menu") {
      idleBob.value = withRepeat(
        withSequence(
          withTiming(-12, { duration: 600, easing: Easing.inOut(Easing.sin) }),
          withTiming(12, { duration: 600, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      );
    } else {
      idleBob.value = 0;
    }
  }, [gameState]);

  useEffect(() => {
    gsRef.current = gameState;
  }, [gameState]);

  // Bird animated style (for idle bob on menu only)
  const birdMenuStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: idleBob.value }],
  }));

  // ---- collision detection ----
  const checkCollision = useCallback(
    (y: number, cp: Pipe[]): boolean => {
      if (y <= 0 || y + BIRD_H >= GAME_H) return true;
      for (const p of cp) {
        const pl = p.x;
        const pr = p.x + PIPE_WIDTH;
        const bl = BIRD_X - BIRD_W / 2 + 4;
        const br = BIRD_X + BIRD_W / 2 - 4;
        const bt = y + 4;
        const bb = y + BIRD_H - 4;
        if (br > pl && bl < pr) {
          if (bt < p.gapY - PIPE_GAP / 2 || bb > p.gapY + PIPE_GAP / 2)
            return true;
        }
      }
      return false;
    },
    [GAME_H, BIRD_X]
  );

  // ---- GAME LOOP via requestAnimationFrame ----
  useEffect(() => {
    let running = true;

    const tick = (timestamp: number) => {
      if (!running) return;

      // Ground scrolling (menu + playing, not gameover)
      if (gsRef.current !== "gameover") {
        groundXRef.current -= PIPE_SPEED;
        if (groundXRef.current <= -48) groundXRef.current = 0;
        setGroundX(groundXRef.current);
      }

      if (gsRef.current === "playing") {
        // Bird physics
        birdVelRef.current += GRAVITY;
        birdYRef.current += birdVelRef.current;
        birdRotRef.current = Math.min(
          Math.max(birdVelRef.current * 3.5, -25),
          80
        );
        setBirdTop(birdYRef.current);
        setBirdRot(birdRotRef.current);

        // Track time for spawning
        if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
        const elapsed = timestamp - lastTimeRef.current;

        // Spawn pipes
        if (
          elapsed - lastSpawnRef.current > PIPE_SPAWN_INTERVAL ||
          pipesRef.current.length === 0
        ) {
          lastSpawnRef.current = elapsed;
          const minG = PIPE_GAP / 2 + 60;
          const maxG = GAME_H - PIPE_GAP / 2 - 60;
          pipesRef.current.push({
            id: pipeIdRef.current++,
            x: SW + PIPE_WIDTH,
            gapY: minG + Math.random() * (maxG - minG),
            scored: false,
          });
        }

        // Move pipes and check scoring
        const active: Pipe[] = [];
        let newScore = scoreRef.current;
        for (const p of pipesRef.current) {
          p.x -= PIPE_SPEED;
          if (!p.scored && p.x + PIPE_WIDTH < BIRD_X - BIRD_W / 2) {
            p.scored = true;
            newScore++;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          if (p.x + PIPE_WIDTH > -10) active.push(p);
        }
        pipesRef.current = active;

        if (newScore !== scoreRef.current) {
          scoreRef.current = newScore;
          setScore(newScore);
        }

        // Update pipe state for rendering
        setPipes(active.map((p) => ({ ...p })));

        // Collision
        if (checkCollision(birdYRef.current, active)) {
          gsRef.current = "gameover";
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setGameState("gameover");
          setBestScore((prev) => Math.max(prev, scoreRef.current));
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [SW, GAME_H, BIRD_X, checkCollision]);

  // ---- input ----
  const onTap = useCallback(() => {
    if (gameState === "menu") {
      birdYRef.current = GAME_H * 0.42;
      birdVelRef.current = JUMP_FORCE;
      birdRotRef.current = -25;
      pipesRef.current = [];
      scoreRef.current = 0;
      pipeIdRef.current = 0;
      lastSpawnRef.current = 0;
      lastTimeRef.current = 0;
      setScore(0);
      setPipes([]);
      setBirdTop(GAME_H * 0.42);
      setBirdRot(-25);
      setGameState("playing");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (gameState === "playing") {
      birdVelRef.current = JUMP_FORCE;
      birdRotRef.current = -25;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      birdYRef.current = GAME_H * 0.42;
      birdVelRef.current = 0;
      birdRotRef.current = 0;
      pipesRef.current = [];
      scoreRef.current = 0;
      pipeIdRef.current = 0;
      lastSpawnRef.current = 0;
      lastTimeRef.current = 0;
      setScore(0);
      setPipes([]);
      setBirdTop(GAME_H * 0.42);
      setBirdRot(0);
      setGameState("menu");
    }
  }, [gameState, GAME_H]);

  // ---- clouds (static decoration) ----
  const clouds = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => ({
        id: i,
        x: (SW / 4) * i + Math.random() * 40,
        y: 40 + Math.random() * (GAME_H * 0.35),
        w: 60 + Math.random() * 50,
      })),
    [SW, GAME_H]
  );

  const medal = useMemo(() => {
    if (score >= 40) return { emoji: "🏆", label: "Champion" };
    if (score >= 20) return { emoji: "🥇", label: "Gold" };
    if (score >= 10) return { emoji: "🥈", label: "Silver" };
    if (score >= 5) return { emoji: "🥉", label: "Bronze" };
    return null;
  }, [score]);

  return (
    <Pressable style={{ flex: 1 }} onPress={onTap}>
      <View style={{ flex: 1, overflow: "hidden" }}>
        {/* ======= SKY ======= */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: SKY_TOP,
          }}
        />
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: GROUND_HEIGHT,
            height: SH * 0.5,
            backgroundColor: SKY_BOTTOM,
            opacity: 0.6,
          }}
        />

        {/* ======= CLOUDS ======= */}
        {clouds.map((c) => (
          <Cloud key={c.id} x={c.x} y={c.y} w={c.w} />
        ))}

        {/* ======= DISTANT HILLS ======= */}
        <View
          style={{
            position: "absolute",
            bottom: GROUND_HEIGHT - 5,
            left: 0,
            right: 0,
            height: 50,
          }}
        >
          {[0, 0.3, 0.55, 0.8].map((p, i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                bottom: 0,
                left: SW * p - 40,
                width: 160,
                height: 50,
                borderRadius: 80,
                backgroundColor: i % 2 === 0 ? "#a8d94a" : "#97cf3a",
              }}
            />
          ))}
        </View>

        {/* ======= PIPES ======= */}
        {pipes.map((pipe) => (
          <PipeView key={pipe.id} pipe={pipe} gameH={GAME_H} />
        ))}

        {/* ======= BIRD ======= */}
        {gameState === "menu" ? (
          <Animated.View
            style={[
              {
                position: "absolute",
                left: BIRD_X - BIRD_W / 2,
                top: birdTop,
                width: BIRD_W,
                height: BIRD_H,
                zIndex: 10,
              },
              birdMenuStyle,
            ]}
          >
            <BirdSprite />
          </Animated.View>
        ) : (
          <View
            style={{
              position: "absolute",
              left: BIRD_X - BIRD_W / 2,
              top: birdTop,
              width: BIRD_W,
              height: BIRD_H,
              zIndex: 10,
              transform: [{ rotate: `${birdRot}deg` }],
            }}
          >
            <BirdSprite />
          </View>
        )}

        {/* ======= GROUND ======= */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: GROUND_HEIGHT,
            overflow: "hidden",
          }}
        >
          <View style={{ height: 18, backgroundColor: GROUND_GRASS }}>
            <View
              style={{
                flexDirection: "row",
                position: "absolute",
                top: -6,
                left: 0,
                transform: [{ translateX: groundX }],
              }}
            >
              {Array.from({ length: Math.ceil(SW / 24) + 4 }, (_, i) => (
                <View
                  key={i}
                  style={{
                    width: 24,
                    height: 12,
                    borderRadius: 12,
                    backgroundColor: i % 2 === 0 ? "#82d636" : "#6ab828",
                    marginRight: -2,
                  }}
                />
              ))}
            </View>
          </View>
          <View style={{ flex: 1, backgroundColor: GROUND_DIRT }}>
            <View
              style={{
                position: "absolute",
                top: 8,
                left: 0,
                right: 0,
                height: 4,
                backgroundColor: GROUND_DIRT_DARK,
                opacity: 0.4,
              }}
            />
            <View
              style={{
                position: "absolute",
                top: 24,
                left: 0,
                right: 0,
                height: 3,
                backgroundColor: GROUND_DIRT_DARK,
                opacity: 0.25,
              }}
            />
            <View
              style={{
                flexDirection: "row",
                position: "absolute",
                top: 14,
                left: 0,
                transform: [{ translateX: groundX }],
              }}
            >
              {Array.from({ length: Math.ceil(SW / 32) + 4 }, (_, i) => (
                <View
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: GROUND_DIRT_DARK,
                    opacity: 0.3,
                    marginHorizontal: 13,
                  }}
                />
              ))}
            </View>
          </View>
        </View>

        {/* ======= SCORE HUD ======= */}
        {gameState === "playing" && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={{
              position: "absolute",
              top: insets.top + 16,
              left: 0,
              right: 0,
              alignItems: "center",
              zIndex: 20,
            }}
          >
            <ScoreText value={score} size={56} />
          </Animated.View>
        )}

        {/* ======= MENU ======= */}
        {gameState === "menu" && (
          <Animated.View
            entering={FadeIn.duration(400)}
            exiting={FadeOut.duration(200)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Animated.View
              entering={FadeInDown.duration(600).springify()}
              style={{
                backgroundColor: "#f5e6c8",
                borderRadius: 20,
                borderCurve: "continuous",
                paddingVertical: 18,
                paddingHorizontal: 40,
                marginBottom: 40,
                boxShadow: "0px 6px 20px rgba(0,0,0,0.2)",
                borderWidth: 3,
                borderColor: "#d4a843",
              }}
            >
              <Text
                style={{
                  fontSize: 40,
                  fontWeight: "900",
                  color: "#5a3a0a",
                  letterSpacing: -1,
                  textAlign: "center",
                }}
              >
                Flappy Bird
              </Text>
            </Animated.View>

            <Animated.View
              entering={FadeInUp.delay(200).duration(500)}
              style={{
                backgroundColor: "rgba(255,255,255,0.85)",
                borderRadius: 30,
                borderCurve: "continuous",
                paddingVertical: 14,
                paddingHorizontal: 36,
              }}
            >
              <Text
                style={{ fontSize: 18, fontWeight: "700", color: "#5a3a0a" }}
              >
                Tap to Play
              </Text>
            </Animated.View>

            {bestScore > 0 && (
              <Animated.View entering={FadeIn.delay(400).duration(400)}>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: "rgba(255,255,255,0.9)",
                    marginTop: 20,
                    textShadowColor: "rgba(0,0,0,0.2)",
                    textShadowOffset: { width: 1, height: 1 },
                    textShadowRadius: 2,
                  }}
                >
                  Best: {bestScore}
                </Text>
              </Animated.View>
            )}
          </Animated.View>
        )}

        {/* ======= GAME OVER ======= */}
        {gameState === "gameover" && (
          <Animated.View
            entering={FadeIn.duration(300)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: "rgba(0,0,0,0.35)",
              zIndex: 30,
            }}
          >
            <Animated.View
              entering={FadeInDown.duration(400).springify()}
              style={{ marginBottom: 20 }}
            >
              <Text
                style={{
                  fontSize: 42,
                  fontWeight: "900",
                  color: "white",
                  textShadowColor: "rgba(0,0,0,0.4)",
                  textShadowOffset: { width: 2, height: 3 },
                  textShadowRadius: 6,
                  letterSpacing: -0.5,
                }}
              >
                Game Over
              </Text>
            </Animated.View>

            <Animated.View
              entering={ZoomIn.delay(200).duration(400).springify()}
              style={{
                backgroundColor: "#f5e6c8",
                borderRadius: 20,
                borderCurve: "continuous",
                padding: 24,
                width: 280,
                alignItems: "center",
                boxShadow: "0px 8px 24px rgba(0,0,0,0.3)",
                borderWidth: 3,
                borderColor: "#d4a843",
              }}
            >
              {medal && (
                <Animated.View
                  entering={ZoomIn.delay(500).duration(400).springify()}
                  style={{ marginBottom: 12 }}
                >
                  <Text style={{ fontSize: 44 }}>{medal.emoji}</Text>
                </Animated.View>
              )}

              <View
                style={{ flexDirection: "row", gap: 32, marginBottom: 20 }}
              >
                <View style={{ alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: "#a08050",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      marginBottom: 4,
                    }}
                  >
                    Score
                  </Text>
                  <Text
                    style={{
                      fontSize: 36,
                      fontWeight: "900",
                      color: "#5a3a0a",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {score}
                  </Text>
                </View>
                <View
                  style={{
                    width: 1,
                    backgroundColor: "#d4a843",
                    opacity: 0.5,
                  }}
                />
                <View style={{ alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: "#a08050",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      marginBottom: 4,
                    }}
                  >
                    Best
                  </Text>
                  <Text
                    style={{
                      fontSize: 36,
                      fontWeight: "900",
                      color: "#5a3a0a",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {bestScore}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  backgroundColor: "#73bf2e",
                  borderRadius: 28,
                  borderCurve: "continuous",
                  paddingVertical: 12,
                  paddingHorizontal: 40,
                  boxShadow: "0px 3px 0px #568a23",
                }}
              >
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "800",
                    color: "white",
                    textShadowColor: "rgba(0,0,0,0.2)",
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 1,
                  }}
                >
                  Play Again
                </Text>
              </View>
            </Animated.View>
          </Animated.View>
        )}
      </View>
    </Pressable>
  );
}

// ============================================================
//  SCORE TEXT
// ============================================================
function ScoreText({ value, size }: { value: number; size: number }) {
  return (
    <View>
      {[
        { x: -2, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: -2 },
        { x: 0, y: 2 },
        { x: -1.5, y: -1.5 },
        { x: 1.5, y: -1.5 },
        { x: -1.5, y: 1.5 },
        { x: 1.5, y: 1.5 },
      ].map((offset, i) => (
        <Text
          key={i}
          style={{
            position: "absolute",
            fontSize: size,
            fontWeight: "900",
            color: "#544e30",
            fontVariant: ["tabular-nums"],
            transform: [{ translateX: offset.x }, { translateY: offset.y }],
          }}
        >
          {value}
        </Text>
      ))}
      <Text
        style={{
          fontSize: size,
          fontWeight: "900",
          color: "white",
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

// ============================================================
//  CLOUD
// ============================================================
function Cloud({ x, y, w }: { x: number; y: number; w: number }) {
  const h = w * 0.45;
  return (
    <View
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        opacity: 0.7,
      }}
    >
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: h * 0.55,
          borderRadius: h * 0.3,
          backgroundColor: "white",
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: h * 0.25,
          left: w * 0.15,
          width: w * 0.4,
          height: h * 0.7,
          borderRadius: w * 0.2,
          backgroundColor: "white",
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: h * 0.2,
          left: w * 0.4,
          width: w * 0.35,
          height: h * 0.55,
          borderRadius: w * 0.17,
          backgroundColor: "white",
        }}
      />
    </View>
  );
}

// ============================================================
//  BIRD SPRITE
// ============================================================
function BirdSprite() {
  return (
    <View style={{ width: BIRD_W, height: BIRD_H }}>
      <View
        style={{
          position: "absolute",
          top: 2,
          left: 0,
          width: BIRD_W - 4,
          height: BIRD_H - 4,
          backgroundColor: "#f8c631",
          borderRadius: 14,
          borderCurve: "continuous",
          boxShadow: "0px 2px 4px rgba(0,0,0,0.15)",
        }}
      >
        <View
          style={{
            position: "absolute",
            bottom: 2,
            left: 6,
            right: 10,
            height: BIRD_H * 0.35,
            backgroundColor: "#fce98e",
            borderRadius: 10,
          }}
        />
        <View
          style={{
            position: "absolute",
            top: 3,
            left: 6,
            right: 10,
            height: 6,
            backgroundColor: "#ffe066",
            borderRadius: 4,
            opacity: 0.7,
          }}
        />
      </View>
      <View
        style={{
          position: "absolute",
          top: 12,
          left: 2,
          width: 18,
          height: 13,
          backgroundColor: "#e8a819",
          borderRadius: 8,
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor: "#c48a10",
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 4,
          right: 8,
          width: 14,
          height: 14,
          backgroundColor: "white",
          borderRadius: 7,
          borderWidth: 1.5,
          borderColor: "#3d2c07",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 7,
            height: 7,
            backgroundColor: "#1a1a2e",
            borderRadius: 3.5,
            marginLeft: 2,
          }}
        >
          <View
            style={{
              position: "absolute",
              top: 1,
              right: 1,
              width: 2.5,
              height: 2.5,
              backgroundColor: "white",
              borderRadius: 1.5,
            }}
          />
        </View>
      </View>
      <View
        style={{
          position: "absolute",
          top: 12,
          right: -6,
          width: 16,
          height: 8,
          backgroundColor: "#ef6b2d",
          borderRadius: 5,
          borderCurve: "continuous",
          zIndex: 2,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 18,
          right: -4,
          width: 12,
          height: 6,
          backgroundColor: "#d4451a",
          borderRadius: 4,
          borderCurve: "continuous",
          zIndex: 1,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 8,
          left: -5,
          width: 10,
          height: 6,
          backgroundColor: "#e0a315",
          borderRadius: 3,
          transform: [{ rotate: "-15deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 14,
          left: -4,
          width: 9,
          height: 5,
          backgroundColor: "#d49510",
          borderRadius: 3,
          transform: [{ rotate: "5deg" }],
        }}
      />
    </View>
  );
}

// ============================================================
//  PIPE
// ============================================================
function PipeView({ pipe, gameH }: { pipe: Pipe; gameH: number }) {
  const gapTop = pipe.gapY - PIPE_GAP / 2;
  const gapBottom = pipe.gapY + PIPE_GAP / 2;
  const bottomH = gameH - gapBottom;
  const CAP_H = 30;
  const CAP_OVERHANG = 6;

  return (
    <>
      {/* TOP PIPE */}
      <View
        style={{
          position: "absolute",
          left: pipe.x,
          top: 0,
          width: PIPE_WIDTH,
          height: gapTop,
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: PIPE_GREEN,
            borderLeftWidth: 2,
            borderRightWidth: 2,
            borderColor: PIPE_BORDER,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 4,
              width: 10,
              bottom: 0,
              backgroundColor: PIPE_GREEN_LIGHT,
              opacity: 0.6,
              borderRadius: 4,
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 0,
              right: 4,
              width: 8,
              bottom: 0,
              backgroundColor: PIPE_GREEN_DARK,
              opacity: 0.4,
              borderRadius: 4,
            }}
          />
        </View>
        <View
          style={{
            width: PIPE_WIDTH + CAP_OVERHANG * 2,
            height: CAP_H,
            marginLeft: -CAP_OVERHANG,
            backgroundColor: PIPE_GREEN,
            borderRadius: 6,
            borderCurve: "continuous",
            borderWidth: 2,
            borderColor: PIPE_BORDER,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              position: "absolute",
              top: 2,
              left: 5,
              width: 12,
              bottom: 2,
              backgroundColor: PIPE_GREEN_LIGHT,
              opacity: 0.5,
              borderRadius: 4,
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 2,
              right: 5,
              width: 10,
              bottom: 2,
              backgroundColor: PIPE_GREEN_DARK,
              opacity: 0.35,
              borderRadius: 4,
            }}
          />
        </View>
      </View>

      {/* BOTTOM PIPE */}
      <View
        style={{
          position: "absolute",
          left: pipe.x,
          top: gapBottom,
          width: PIPE_WIDTH,
          height: bottomH,
        }}
      >
        <View
          style={{
            width: PIPE_WIDTH + CAP_OVERHANG * 2,
            height: CAP_H,
            marginLeft: -CAP_OVERHANG,
            backgroundColor: PIPE_GREEN,
            borderRadius: 6,
            borderCurve: "continuous",
            borderWidth: 2,
            borderColor: PIPE_BORDER,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              position: "absolute",
              top: 2,
              left: 5,
              width: 12,
              bottom: 2,
              backgroundColor: PIPE_GREEN_LIGHT,
              opacity: 0.5,
              borderRadius: 4,
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 2,
              right: 5,
              width: 10,
              bottom: 2,
              backgroundColor: PIPE_GREEN_DARK,
              opacity: 0.35,
              borderRadius: 4,
            }}
          />
        </View>
        <View
          style={{
            flex: 1,
            backgroundColor: PIPE_GREEN,
            borderLeftWidth: 2,
            borderRightWidth: 2,
            borderColor: PIPE_BORDER,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 4,
              width: 10,
              bottom: 0,
              backgroundColor: PIPE_GREEN_LIGHT,
              opacity: 0.6,
              borderRadius: 4,
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 0,
              right: 4,
              width: 8,
              bottom: 0,
              backgroundColor: PIPE_GREEN_DARK,
              opacity: 0.4,
              borderRadius: 4,
            }}
          />
        </View>
      </View>
    </>
  );
}
