import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Game constants
const BIRD_SIZE = 34;
const GRAVITY = 0.6;
const JUMP_FORCE = -9;
const PIPE_WIDTH = 60;
const PIPE_GAP = 180;
const PIPE_SPEED = 3;
const PIPE_SPAWN_INTERVAL = 1800; // ms
const GROUND_HEIGHT = 80;

type Pipe = {
  id: number;
  x: number;
  gapY: number;
  scored: boolean;
};

type GameState = "menu" | "playing" | "gameover";

export default function FlappyBird() {
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const GAME_H = SCREEN_H - GROUND_HEIGHT;
  const BIRD_X = SCREEN_W * 0.25;

  // Game state
  const [gameState, setGameState] = useState<GameState>("menu");
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [pipes, setPipes] = useState<Pipe[]>([]);

  // Bird physics (shared values for frame callback)
  const birdY = useSharedValue(GAME_H / 2);
  const birdVelocity = useSharedValue(0);
  const birdRotation = useSharedValue(0);

  // Refs for mutable game state accessible in frame callback
  const pipesRef = useRef<Pipe[]>([]);
  const scoreRef = useRef(0);
  const gameStateRef = useRef<GameState>("menu");
  const lastPipeSpawn = useRef(0);
  const pipeIdCounter = useRef(0);

  // Keep refs in sync
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Bird animated style
  const birdStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: birdY.value },
      { rotate: `${birdRotation.value}deg` },
    ],
  }));

  // Collision detection
  const checkCollision = useCallback(
    (y: number, currentPipes: Pipe[]): boolean => {
      // Ground / ceiling
      if (y <= 0 || y + BIRD_SIZE >= GAME_H) return true;

      // Pipes
      for (const pipe of currentPipes) {
        const pipeLeft = pipe.x;
        const pipeRight = pipe.x + PIPE_WIDTH;
        const birdLeft = BIRD_X - BIRD_SIZE / 2;
        const birdRight = BIRD_X + BIRD_SIZE / 2;
        const birdTop = y;
        const birdBottom = y + BIRD_SIZE;

        if (birdRight > pipeLeft && birdLeft < pipeRight) {
          const gapTop = pipe.gapY - PIPE_GAP / 2;
          const gapBottom = pipe.gapY + PIPE_GAP / 2;
          if (birdTop < gapTop || birdBottom > gapBottom) {
            return true;
          }
        }
      }
      return false;
    },
    [GAME_H, BIRD_X]
  );

  // Game over handler
  const handleGameOver = useCallback(() => {
    setGameState("gameover");
    setBestScore((prev) => Math.max(prev, scoreRef.current));
  }, []);

  // Score increment handler
  const handleScore = useCallback(() => {
    scoreRef.current += 1;
    setScore(scoreRef.current);
  }, []);

  // Sync pipes to React state for rendering (throttled)
  const syncPipes = useCallback((p: Pipe[]) => {
    setPipes([...p]);
  }, []);

  // Frame callback — runs every frame
  useFrameCallback((info) => {
    if (gameStateRef.current !== "playing") return;

    const now = info.timeSinceFirstFrame;

    // Bird physics
    birdVelocity.value += GRAVITY;
    birdY.value += birdVelocity.value;

    // Rotation based on velocity
    birdRotation.value = Math.min(
      Math.max(birdVelocity.value * 3, -30),
      90
    );

    // Spawn pipes
    if (now - lastPipeSpawn.current > PIPE_SPAWN_INTERVAL) {
      lastPipeSpawn.current = now;
      const minGapY = PIPE_GAP / 2 + 40;
      const maxGapY = GAME_H - PIPE_GAP / 2 - 40;
      const gapY = minGapY + Math.random() * (maxGapY - minGapY);
      pipesRef.current.push({
        id: pipeIdCounter.current++,
        x: SCREEN_W + PIPE_WIDTH,
        gapY,
        scored: false,
      });
    }

    // Move pipes
    const activePipes: Pipe[] = [];
    for (const pipe of pipesRef.current) {
      pipe.x -= PIPE_SPEED;

      // Score
      if (!pipe.scored && pipe.x + PIPE_WIDTH < BIRD_X - BIRD_SIZE / 2) {
        pipe.scored = true;
        runOnJS(handleScore)();
      }

      // Keep pipe if still visible
      if (pipe.x + PIPE_WIDTH > -10) {
        activePipes.push(pipe);
      }
    }
    pipesRef.current = activePipes;

    // Sync to React state for rendering
    runOnJS(syncPipes)(activePipes);

    // Collision
    if (checkCollision(birdY.value, activePipes)) {
      runOnJS(handleGameOver)();
    }
  });

  // Tap to jump / start
  const onTap = useCallback(() => {
    if (gameState === "menu") {
      // Start game
      birdY.value = GAME_H / 2;
      birdVelocity.value = JUMP_FORCE;
      birdRotation.value = -30;
      pipesRef.current = [];
      scoreRef.current = 0;
      pipeIdCounter.current = 0;
      lastPipeSpawn.current = 0;
      setScore(0);
      setPipes([]);
      setGameState("playing");
    } else if (gameState === "playing") {
      // Jump
      birdVelocity.value = JUMP_FORCE;
      birdRotation.value = -30;
    } else if (gameState === "gameover") {
      // Reset to menu
      birdY.value = GAME_H / 2;
      birdVelocity.value = 0;
      birdRotation.value = 0;
      pipesRef.current = [];
      scoreRef.current = 0;
      pipeIdCounter.current = 0;
      lastPipeSpawn.current = 0;
      setScore(0);
      setPipes([]);
      setGameState("menu");
    }
  }, [gameState, GAME_H, birdY, birdVelocity, birdRotation]);

  return (
    <Pressable style={{ flex: 1 }} onPress={onTap}>
      <View style={{ flex: 1, backgroundColor: "#70c5ce" }}>
        {/* Sky gradient effect using layered views */}
        <View
          style={{
            position: "absolute",
            bottom: GROUND_HEIGHT,
            left: 0,
            right: 0,
            height: 120,
            backgroundColor: "#8fd5d8",
          }}
        />

        {/* Pipes */}
        {pipes.map((pipe) => (
          <PipeView
            key={pipe.id}
            pipe={pipe}
            gameHeight={GAME_H}
            pipeGap={PIPE_GAP}
          />
        ))}

        {/* Bird */}
        <Animated.View
          style={[
            {
              position: "absolute",
              left: BIRD_X - BIRD_SIZE / 2,
              width: BIRD_SIZE,
              height: BIRD_SIZE,
            },
            birdStyle,
          ]}
        >
          <BirdSprite />
        </Animated.View>

        {/* Ground */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: GROUND_HEIGHT,
            backgroundColor: "#ded895",
            borderTopWidth: 3,
            borderTopColor: "#5a8a2a",
          }}
        >
          <View
            style={{
              height: 20,
              backgroundColor: "#5a8a2a",
            }}
          />
        </View>

        {/* Score display */}
        {gameState === "playing" && (
          <View
            style={{
              position: "absolute",
              top: insets.top + 20,
              left: 0,
              right: 0,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 52,
                fontWeight: "900",
                color: "white",
                fontVariant: ["tabular-nums"],
                textShadowColor: "rgba(0,0,0,0.3)",
                textShadowOffset: { width: 2, height: 2 },
                textShadowRadius: 4,
              }}
            >
              {score}
            </Text>
          </View>
        )}

        {/* Menu overlay */}
        {gameState === "menu" && (
          <View
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
            <Text
              style={{
                fontSize: 48,
                fontWeight: "900",
                color: "white",
                textShadowColor: "rgba(0,0,0,0.3)",
                textShadowOffset: { width: 2, height: 2 },
                textShadowRadius: 4,
                marginBottom: 8,
              }}
            >
              Flappy Bird
            </Text>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "600",
                color: "white",
                textShadowColor: "rgba(0,0,0,0.2)",
                textShadowOffset: { width: 1, height: 1 },
                textShadowRadius: 2,
                opacity: 0.9,
              }}
            >
              Tap to Start
            </Text>
            {bestScore > 0 && (
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: "white",
                  marginTop: 16,
                  opacity: 0.8,
                }}
              >
                Best: {bestScore}
              </Text>
            )}
          </View>
        )}

        {/* Game over overlay */}
        {gameState === "gameover" && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: "rgba(0,0,0,0.3)",
            }}
          >
            <View
              style={{
                backgroundColor: "#DEB886",
                borderRadius: 16,
                borderCurve: "continuous",
                padding: 32,
                alignItems: "center",
                width: 260,
                boxShadow: "0px 4px 12px rgba(0,0,0,0.3)",
              }}
            >
              <Text
                style={{
                  fontSize: 36,
                  fontWeight: "900",
                  color: "#5a3e1b",
                  marginBottom: 20,
                }}
              >
                Game Over
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-around",
                  width: "100%",
                  marginBottom: 24,
                }}
              >
                <View style={{ alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: "#8a6e3e",
                    }}
                  >
                    Score
                  </Text>
                  <Text
                    style={{
                      fontSize: 32,
                      fontWeight: "900",
                      color: "#5a3e1b",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {score}
                  </Text>
                </View>
                <View style={{ alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: "#8a6e3e",
                    }}
                  >
                    Best
                  </Text>
                  <Text
                    style={{
                      fontSize: 32,
                      fontWeight: "900",
                      color: "#5a3e1b",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {bestScore}
                  </Text>
                </View>
              </View>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: "#8a6e3e",
                }}
              >
                Tap to Restart
              </Text>
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// Bird sprite built with Views
function BirdSprite() {
  return (
    <View
      style={{
        width: BIRD_SIZE,
        height: BIRD_SIZE,
        backgroundColor: "#f7dc6f",
        borderRadius: BIRD_SIZE / 2,
        borderCurve: "continuous",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Body highlight */}
      <View
        style={{
          position: "absolute",
          top: 3,
          left: 3,
          right: 6,
          height: BIRD_SIZE * 0.4,
          backgroundColor: "#fce88e",
          borderRadius: BIRD_SIZE / 3,
        }}
      />
      {/* Eye */}
      <View
        style={{
          position: "absolute",
          top: 7,
          right: 6,
          width: 10,
          height: 10,
          backgroundColor: "white",
          borderRadius: 5,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 5,
            height: 5,
            backgroundColor: "#1a1a2e",
            borderRadius: 2.5,
          }}
        />
      </View>
      {/* Beak */}
      <View
        style={{
          position: "absolute",
          top: 15,
          right: -5,
          width: 12,
          height: 8,
          backgroundColor: "#e8833a",
          borderRadius: 4,
        }}
      />
      {/* Wing */}
      <View
        style={{
          position: "absolute",
          bottom: 6,
          left: 4,
          width: 14,
          height: 10,
          backgroundColor: "#e5c54b",
          borderRadius: 5,
        }}
      />
    </View>
  );
}

// Pipe component
function PipeView({
  pipe,
  gameHeight,
  pipeGap,
}: {
  pipe: Pipe;
  gameHeight: number;
  pipeGap: number;
}) {
  const gapTop = pipe.gapY - pipeGap / 2;
  const gapBottom = pipe.gapY + pipeGap / 2;
  const bottomPipeHeight = gameHeight - gapBottom;

  return (
    <>
      {/* Top pipe */}
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
            backgroundColor: "#5ea832",
            borderLeftWidth: 2,
            borderRightWidth: 2,
            borderColor: "#3d7a1c",
          }}
        />
        {/* Pipe cap */}
        <View
          style={{
            width: PIPE_WIDTH + 8,
            height: 26,
            backgroundColor: "#5ea832",
            borderRadius: 4,
            borderCurve: "continuous",
            borderWidth: 2,
            borderColor: "#3d7a1c",
            marginLeft: -5,
          }}
        />
      </View>

      {/* Bottom pipe */}
      <View
        style={{
          position: "absolute",
          left: pipe.x,
          top: gapBottom,
          width: PIPE_WIDTH,
          height: bottomPipeHeight,
        }}
      >
        {/* Pipe cap */}
        <View
          style={{
            width: PIPE_WIDTH + 8,
            height: 26,
            backgroundColor: "#5ea832",
            borderRadius: 4,
            borderCurve: "continuous",
            borderWidth: 2,
            borderColor: "#3d7a1c",
            marginLeft: -5,
          }}
        />
        <View
          style={{
            flex: 1,
            backgroundColor: "#5ea832",
            borderLeftWidth: 2,
            borderRightWidth: 2,
            borderColor: "#3d7a1c",
          }}
        />
      </View>
    </>
  );
}
