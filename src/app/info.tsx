import { ScrollView, Text } from "react-native";

export default function InfoRoute() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{
        padding: 16,
        backgroundColor: "white",
      }}
    >
      <Text>Info</Text>
    </ScrollView>
  );
}
