import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once("ready", async () => {
  console.log(`✅ 로그인됨: ${client.user.tag}`);
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  console.log(`🔗 연결된 서버: ${guild.name}`);

  // 슬래시 커맨드 등록
  const commands = [
    {
      name: "pair",
      description: "페어 매칭을 즉시 실행합니다",
    },
  ];

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log("슬래시 커맨드 등록 중...");
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("✅ 슬래시 커맨드 등록 완료!");
  } catch (error) {
    console.error("❌ 슬래시 커맨드 등록 실패:", error);
  }
});

/**
 * 랜덤 페어 매칭 함수
 * 1명이 남으면 마지막 그룹에 포함
 */
async function makePairs(guild) {
  const members = await guild.members.fetch();

  const users = members
    .filter(
      (m) => !m.user.bot && m.roles.cache.has(process.env.THIRD_GEN_ROLE_ID)
    )
    .map((m) => `<@${m.user.id}>`);

  // 셔플
  for (let i = users.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [users[i], users[j]] = [users[j], users[i]];
  }

  const pairs = [];

  // 2명씩 묶기
  while (users.length >= 2) {
    pairs.push(users.splice(0, 2));
  }

  // 1명 남으면 마지막 팀에 합치기
  if (users.length === 1 && pairs.length > 0) {
    pairs[pairs.length - 1].push(users[0]);
  }

  return pairs;
}

/**
 * 페어 매칭 메시지 생성
 */
function createPairMessage(pairs) {
  let message = "🎉 이번 주 페어가 정해졌어요!\n\n";
  pairs.forEach((group, i) => {
    const emoji = ["👥", "🤝", "💪", "✨", "🌟", "🚀"][i % 6];
    message += `${emoji} **그룹 ${i + 1}** (${group.length}명): ${group.join(
      ", "
    )}\n`;
  });

  message += "\n오늘까지 꾸문 제출하는 것 잊지마세요~!\n화이팅입니다! 🔥🔥";
  return message;
}

/**
 * /pair 슬래시 커맨드 핸들러
 */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "pair") {
    await interaction.deferReply();

    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      const pairs = await makePairs(guild);
      const message = createPairMessage(pairs);

      await interaction.editReply(message);
      console.log("✅ /pair 커맨드로 페어 매칭 완료");
    } catch (error) {
      console.error("❌ /pair 커맨드 실행 실패:", error);
      await interaction.editReply(
        "⚠️ 페어 매칭 중 오류가 발생했습니다. 다시 시도해주세요."
      );
    }
  }
});

/**
 * 매주 월요일 오전 10시 실행 (한국 시간)
 */
cron.schedule(
  "0 10 * * 1",
  async () => {
    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      const channel = await client.channels.fetch(process.env.CHANNEL_ID);
      const pairs = await makePairs(guild);
      const message = createPairMessage(pairs);

      await channel.send(message);
      console.log("✅ 자동 페어 매칭 완료 (월요일 10시)");
    } catch (error) {
      console.error("❌ 자동 페어 매칭 실패:", error);
    }
  },
  { timezone: "Asia/Seoul" }
);

client.login(process.env.DISCORD_TOKEN);
