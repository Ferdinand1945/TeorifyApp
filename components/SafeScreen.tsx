import React from "react";
import { cssInterop } from "nativewind";
import type { StyleProp, ViewStyle } from "react-native";
import {
  type Edge,
  SafeAreaView as RNSafeAreaView,
} from "react-native-safe-area-context";

const StyledSafeAreaView = cssInterop(RNSafeAreaView, { className: "style" });

type SafeScreenProps = {
  children: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  edges?: Edge[];
};

export function SafeScreen({
  children,
  className,
  style,
  edges = ["top", "bottom"],
}: SafeScreenProps) {
  return (
    <StyledSafeAreaView edges={edges} style={style} className={className}>
      {children}
    </StyledSafeAreaView>
  );
}

