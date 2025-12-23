import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import cron from "node-cron";
import dotenv from "dotenv";
import { getWeekStart } from "./dateUtils.js";
import { appendRow, getRows } from "./googleSheets.js";
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
    {
      name: "comment",
      description: "댓글 작성 완료 처리",
      options: [
        {
          name: "writer",
          description: "댓글 작성자 (생략 시 명령 실행자)",
          type: 6,
          required: false,
        },
        {
          name: "target",
          description: "댓글 대상",
          type: 6,
          required: true,
        },
      ],
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
 * /pair, /comment 슬래시 커맨드 핸들러
 */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // /pair
  if (interaction.commandName === "pair") {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      const pairs = await makePairs(guild);
      const weekStart = getWeekStart();

      for (const [groupIndex, group] of pairs.entries()) {
        for (const mention of group) {
          const userId = mention.replace(/[<@>]/g, "");
          await appendRow("bot_pairs", [weekStart, groupIndex + 1, userId]);
        }
      }

      await interaction.editReply(createPairMessage(pairs));
    } catch (error) {
      console.error(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("⚠️ 페어 매칭 중 오류가 발생했습니다.");
      }
    }
    return;
  }

  // /comment
  if (interaction.commandName === "comment") {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    const weekStart = getWeekStart();

    // writer가 없으면 명령 실행자가 writer
    const writer = interaction.options.getUser("writer") ?? interaction.user;

    const target = interaction.options.getUser("target");
    const recordedBy = interaction.user;

    if (!target) {
      return interaction.editReply("⚠️ 댓글 대상이 지정되지 않았어요.");
    }

    const rows = await getRows("bot_weekly_comments");

    // same week + writer + target
    const already = rows.find(
      (r) => r[0] === weekStart && r[1] === writer.id && r[2] === target.id
    );

    if (already) {
      return interaction.editReply(
        "✅ 이미 이번 주에 해당 댓글이 기록되어 있어요!"
      );
    }

    await appendRow("bot_weekly_comments", [
      weekStart,
      writer.id,
      target.id,
      recordedBy.id,
      new Date().toISOString(),
    ]);

    await interaction.editReply(
      `✍️ 댓글 기록 완료!\n\n- 작성자: ${writer.username}\n- 대상: ${target.username}`
    );
    return;
  }
});

client.on("threadCreate", async (thread) => {
  if (thread.parentId !== process.env.FORUM_CHANNEL_ID) return;

  const ownerId = thread.ownerId;
  if (!ownerId) return;

  const weekStart = getWeekStart(thread.createdAt);

  await appendRow("bot_weekly_posts", [
    weekStart,
    ownerId,
    thread.createdAt.toISOString(),
  ]);

  console.log("📝 포럼 새 포스트 기록:", ownerId);
});

/**
 * 매주 월요일 오전 10시 실행 (한국 시간)
 */
cron.schedule(
  "0 10 * * 1",
  async () => {
    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      const channel = await client.channels.fetch(process.env.PAIR_CHANNEL_ID);
      const pairs = await makePairs(guild);

      const weekStart = getWeekStart();

      pairs.forEach((group, groupIndex) => {
        group.forEach((mention) => {
          const userId = mention.replace(/[<@>]/g, "");
          appendRow("bot_pairs", [weekStart, groupIndex + 1, userId]);
        });
      });

      const message = createPairMessage(pairs);

      await channel.send(message);
      console.log("✅ 자동 페어 매칭 완료 (월요일 10시)");
    } catch (error) {
      console.error("❌ 자동 페어 매칭 실패:", error);
    }
  },
  { timezone: "Asia/Seoul" }
);

cron.schedule(
  "59 23 * * 2",
  async () => {
    try {
      /* 1️⃣ 기준 주 계산 (지난 주) */
      const lastWeek = getWeekStart(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      );

      /* 2️⃣ 데이터 조회 */
      const members = await getRows("bot_members");
      const comments = await getRows("bot_weekly_comments");
      const posts = await getRows("bot_weekly_posts");

      /* 3️⃣ 댓글 작성자 */
      const commented = new Set(
        comments.filter((r) => r[0] === lastWeek).map((r) => r[1])
      );

      /* 4️⃣ 포럼 포스트 */
      const postMap = new Map();

      posts
        .filter((r) => r[0] === lastWeek)
        .forEach(([_, userId, createdAt]) => {
          const time = new Date(createdAt);
          if (!postMap.has(userId) || postMap.get(userId) > time) {
            postMap.set(userId, time);
          }
        });

      /* 5️⃣ 포럼 벌금 계산 함수 */
      function calcPostFine(postTime) {
        if (!postTime) return 5000;

        const mondayDeadline = new Date(`${lastWeek}T23:59:59`);
        const tuesdayDeadline = new Date(mondayDeadline);
        tuesdayDeadline.setDate(tuesdayDeadline.getDate() + 1);

        if (postTime <= mondayDeadline) return 0;
        if (postTime <= tuesdayDeadline) return 1000;
        return 5000;
      }

      /* 6️⃣ 사용자별 벌금 계산 */
      const fines = [];

      for (const [userId] of members) {
        let totalFine = 0;
        const reasons = [];

        // 댓글 벌금
        if (!commented.has(userId)) {
          totalFine += 1000;
          reasons.push("댓글 미작성");
        }

        // 포럼 벌금
        const postTime = postMap.get(userId);
        const postFine = calcPostFine(postTime);

        if (postFine > 0) {
          totalFine += postFine;
          reasons.push(postFine === 1000 ? "포럼 지각" : "포럼 미작성");
        }

        if (totalFine > 0) {
          fines.push({ userId, totalFine, reasons });
        }
      }

      /* 7️⃣ 시트 기록 */
      for (const f of fines) {
        await appendRow("bot_fines", [
          lastWeek,
          f.userId,
          f.totalFine,
          f.reasons.join(", "),
          new Date().toISOString(),
        ]);
      }

      /* 8️⃣ 디스코드 알림 */
      if (fines.length > 0) {
        const channel = await client.channels.fetch(
          process.env.FINE_CHANNEL_ID
        );

        const message =
          "💸 이번 주 벌금 정산 결과입니다.\n\n" +
          fines
            .map(
              (f) =>
                `- <@${f.userId}>: ${f.totalFine}원 (${f.reasons.join(" + ")})`
            )
            .join("\n");

        await channel.send(message);
      }

      console.log("💸 벌금 처리 완료:", fines);
    } catch (error) {
      console.error("❌ 벌금 cron 오류:", error);
    }
  },
  { timezone: "Asia/Seoul" }
);

client.login(process.env.DISCORD_TOKEN);
