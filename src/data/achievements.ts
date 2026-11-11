// Shown on /achievements. Professional-level recognition only (no campus-level awards).
// Leave `year` empty when unsure rather than guessing; `link` points to proof where public.
export type Achievement = {
  event: string;
  result: string;
  year: string;
  description: string;
  group: "Competitive programming" | "Research" | "Community leadership";
  link?: { href: string; label: string };
};

export const achievements: Achievement[] = [
  { group: "Competitive programming", event: "IEEEXtreme 2024", result: "7th in Nepal · top 700 worldwide", year: "2024",
    description: "A 24-hour global programming contest with 7,000+ teams, solved in C++ under strict memory and time limits." },

  { group: "Research", event: "Lightweight parasitic egg detection using a modified YOLOv11", result: "Peer-reviewed paper", year: "2025",
    description: "International Journal on Engineering Technology, Vol. 3 No. 1. 0.96 mAP@0.5 with 58% fewer parameters than the baseline, small enough for phones and CPUs.",
    link: { href: "https://github.com/thegauravgiri/yolo-enhancedconv", label: "Code" } },
  { group: "Research", event: "CNN-based bird sound detection: a comparative study", result: "Peer-reviewed paper", year: "2025",
    description: "International Journal on Engineering Technology, Vol. 2 No. 2. A tuned ResNet50 reached 90.75% accuracy on noisy outdoor recordings." },

  { group: "Community leadership", event: "Google Developer Groups Kathmandu", result: "Ed-Tech Lead", year: "2024 to now",
    description: "Run workshops, study jams and speaker line-ups for DevFest Kathmandu and Google I/O Extended. Previously designer and organiser (2023 to 2024)." },
  { group: "Community leadership", event: "UbuCon Asia 2025, Kathmandu", result: "Organiser", year: "2025",
    description: "Core organising team for the pan-Asian Ubuntu and open-source conference, including its branding." },
];
