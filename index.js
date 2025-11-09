import { Client, GatewayIntentBits } from "discord.js";
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
});

async function makePairs(guild) {
  const members = await guild.members.fetch();
  const users = members.filter((m) => !m.user.bot).map((m) => m.user.username);

  // 셔플
  for (let i = users.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [users[i], users[j]] = [users[j], users[i]];
  }

  // 2~3명씩 그룹화 (1명이 남지 않도록 스마트하게)
  const pairs = [];
  while (users.length > 0) {
    let size;

    if (users.length === 1) {
      // 1명 남으면 이전 그룹에 합치기
      if (pairs.length > 0) {
        pairs[pairs.length - 1].push(users[0]);
        break;
      } else {
        // 처음부터 1명이면 그대로
        pairs.push(users.splice(0, 1));
      }
    } else if (users.length === 2 || users.length === 3) {
      // 2~3명 남으면 한 그룹으로
      pairs.push(users.splice(0, users.length));
    } else if (users.length === 4) {
      // 4명 남으면 2+2로
      size = 2;
      pairs.push(users.splice(0, size));
    } else if (users.length === 5) {
      // 5명 남으면 2 또는 3 선택 (남은 3명 또는 2명)
      size = Math.random() < 0.5 ? 2 : 3;
      pairs.push(users.splice(0, size));
    } else {
      // 6명 이상: 다음 선택이 1명을 남기지 않는지 확인
      if (users.length % 2 === 1) {
        // 홀수면 3명 선택 (남은 수를 짝수로)
        size = 3;
      } else {
        // 짝수면 랜덤
        size = Math.random() < 0.5 ? 2 : 3;
      }
      pairs.push(users.splice(0, size));
    }
  }
  return pairs;
}

/**
 * 매주 월요일 오전 10시 실행 (한국 시간)
 */
cron.schedule(
  "0 10 * * 1",
  async () => {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channel = await client.channels.fetch(process.env.CHANNEL_ID);
    const pairs = await makePairs(guild);

    let message = "🎉 이번 주 페어가 정해졌어요!\n\n";
    pairs.forEach((group, i) => {
      const emoji = ["👥", "🤝", "💪", "✨", "🌟", "🚀"][i % 6];
      message += `${emoji} **그룹 ${i + 1}** (${group.length}명): ${group.join(
        ", "
      )}\n`;
    });

    message += "\n💬 오늘까지 꾸문 제출하는 것 잊지마세요~!\n🔥 화이팅입니다!";
    await channel.send(message);
  },
  { timezone: "Asia/Seoul" }
);

client.login(process.env.DISCORD_TOKEN);
