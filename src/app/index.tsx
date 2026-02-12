import { StatusBar } from "expo-status-bar";
import FlappyBird from "@/components/flappy-bird";

export default function GameRoute() {
  return (
    <>
      <StatusBar style="light" />
      <FlappyBird />
    </>
  );
}
