import React from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

interface CategoryIconProps {
  name: string;
  size: number;
  color: string;
}

export default function CategoryIcon({ name, size, color }: CategoryIconProps) {
  if (name.startsWith("mci:")) {
    return <MaterialCommunityIcons name={name.slice(4) as any} size={size} color={color} />;
  }
  return <Ionicons name={name as any} size={size} color={color} />;
}