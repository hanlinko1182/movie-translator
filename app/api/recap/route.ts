import { NextResponse } from "next/server";

export async function POST() {
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return NextResponse.json({
    success: true,
    recap: {
      title: "The Hidden Dragon",

      summary:
        "အဓိကဇာတ်ကောင်သည် သတိကြီးစွာ ဆုံးဖြတ်တတ်သူဖြစ်ပြီး အခြေအနေများက သူ့ဘဝကို ပြောင်းလဲစေသည်။",

      characters: [
        {
          name: "Main Character",
          personality: "တည်ငြိမ်ပြီး စဉ်းစားတတ်သူ",
        },
      ],

      events: [
        "မမျှော်လင့်သောဖြစ်ရပ်တစ်ခု ဖြစ်ပေါ်သည်",
        "ပဋိပက္ခ စတင်လာသည်",
        "ဇာတ်ကောင်များ၏ ဆက်ဆံရေး ပြောင်းလဲလာသည်",
      ],
    },
  });
}