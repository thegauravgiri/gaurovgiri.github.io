// Projects shown on /projects. `featured` ones get the top section; the rest are listed below.
// `url` is optional: leave it out for work that has no public repo or page.
export type Project = { name: string; url?: string; description: string; tags: string[]; featured?: boolean; note?: string };

const gh = (repo: string) => `https://github.com/thegauravgiri/${repo}`;

export const projects: Project[] = [
  {
    name: "This website",
    url: "/",
    featured: true,
    description: "A portfolio you can talk to. Ask the 3D avatar on the home page anything about my work, in English or Nepali, and it answers in my own cloned voice.",
    tags: ["Astro", "React", "Three.js", "Voice AI"],
  },
  {
    name: "Mitra",
    url: gh("mitra-mcp"),
    featured: true,
    description: "An MCP server that lets AI assistants work with Azure DevOps, Jira, Clockify and Google Calendar. Credentials are protected with OAuth 2.1 (PKCE) and Cloud KMS envelope encryption, so tokens never sit in local config files. 30+ validated tools.",
    tags: ["Python", "FastMCP", "OAuth 2.1", "Google Cloud KMS", "PostgreSQL", "Docker"],
  },
  {
    name: "Lightweight parasitic egg detection",
    url: gh("yolo-enhancedconv"),
    featured: true,
    note: "Published in IJET, 2025",
    description: "A modified YOLOv11 with Ghost convolutions, hybrid SimAM-ECA attention and DropBlock. It reaches 0.96 mAP@0.5 with 58% fewer parameters than the baseline, light enough to run on CPUs and phones where lab equipment is scarce.",
    tags: ["PyTorch", "YOLOv11", "Computer vision"],
  },
  {
    name: "Aitihasik Katha",
    url: gh("aitihasik-katha"),
    featured: true,
    description: "Turns English and Nepali historical documents into narrated documentary videos: OCR, retrieval, script writing, narration and video rendering in one pipeline.",
    tags: ["Python", "LangChain", "ChromaDB", "Edge-TTS", "MoviePy"],
  },
  {
    name: "Minecraft agents",
    url: gh("minecraft-agents"),
    featured: true,
    description: "Autonomous AI players that act like real teammates. They chat, pick a leader, split up big builds, fight mobs side by side and rescue each other at night. Just say “build a castle here”.",
    tags: ["JavaScript", "Mineflayer", "LLM agents"],
  },
  {
    name: "ChatChamber",
    url: gh("chat-chamber"),
    featured: true,
    note: "Finalist, IEEE “Can You C?”",
    description: "A multi-user chat server and terminal client written from scratch in C, with raw POSIX sockets, pthreads, custom message framing and an ncurses interface.",
    tags: ["C", "POSIX sockets", "pthreads", "ncurses"],
  },

  {
    name: "Nepali News API",
    url: gh("newsapi"),
    description: "A free, open-source API that scrapes the top Nepali news sites every few hours and serves clean JSON.",
    tags: ["Python", "GitHub Actions"],
  },
  {
    name: "Snap Tag",
    url: gh("snaptag-backend"),
    description: "Ctrl+F for handwritten notebooks: auto-crops a page photo, reads the handwriting and indexes it so students can search their notes (89% accuracy).",
    tags: ["OpenCV", "PyTorch", "spaCy", "Flutter"],
  },
  {
    name: "Bird sound detection",
    note: "Published in IJET, 2025",
    description: "A comparison of CNNs for detecting bird species from mel-spectrograms in noisy outdoor recordings; a tuned ResNet50 reached 90.75% accuracy. It grew into FeatherFind, which identifies birds from sound, photos and location.",
    tags: ["PyTorch", "Audio", "Django REST", "Flutter"],
  },
  {
    name: "Smart-Lawyer",
    description: "A legal assistant grounded in the Constitution of Nepal and civil codes.",
    tags: ["FastAPI", "React", "LangChain", "Pinecone"],
  },
  {
    name: "Sangyaan",
    note: "Winner, Hackademia",
    description: "A learning app for children with dysgraphia and dyscalculia, with drawing exercises and adaptive maths.",
    tags: ["Flutter", "TensorFlow"],
  },
  {
    name: "Mathemagic",
    url: gh("mathemagic"),
    note: "Winner, Locus Hack-A-Week (games)",
    description: "Help a witch through a mathemagical forest by solving maths puzzles.",
    tags: ["Flutter", "Flame"],
  },
  {
    name: "SeeFood",
    url: gh("seefood"),
    description: "Recognises Nepali dishes from a photo and flags allergens, for travellers.",
    tags: ["Computer vision", "Flutter"],
  },
  {
    name: "PianoGiri",
    url: gh("pianogiri"),
    description: "A virtual grand piano in the browser, playable from your keyboard, with sustain, velocity and octave switching.",
    tags: ["JavaScript", "Web Audio"],
  },
  {
    name: "Beat the Number 21",
    url: gh("beat-the-number-21"),
    description: "A two-player game where whoever says 21 loses, with a minimax opponent.",
    tags: ["Flutter"],
  },
  {
    name: "DSA and numerical methods in C++",
    url: gh("NumericalMethods"),
    description: "Data structures, algorithms and numerical methods (Runge-Kutta, Newton-Raphson, Gauss-Jordan) in C++, with stress tests.",
    tags: ["C++"],
  },
];
