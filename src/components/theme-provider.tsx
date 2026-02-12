import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as RNTheme,
} from "@react-navigation/native";
import { useColorScheme } from "react-native";

const useScheme =
  process.env.EXPO_OS === "web" ? () => "light" : useColorScheme;

export function ThemeProvider(props: { children: React.ReactNode }) {
  const colorScheme = useScheme();
  return (
    <RNTheme value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      {props.children}
    </RNTheme>
  );
}
