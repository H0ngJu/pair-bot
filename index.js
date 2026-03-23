import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import cron from "node-cron";
import dotenv from "dotenv";
import { getBiweekStart, getBiweekCycle } from "./dateUtils.js";
import { appendRow, getRows } from "./googleSheets.js";
import { getDeadlines, calculateFines } from "./fineUtils.js";
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

  // 포럼 채널 접근 테스트
  try {
    const forumChannel = await client.channels.fetch(
      process.env.FORUM_CHANNEL_ID,
    );
    console.log(
      `✅ 포럼 채널 접근 가능: ${forumChannel.name} (${forumChannel.id})`,
    );
  } catch (error) {
    console.error(`❌ 포럼 채널 접근 실패: ${error.message}`);
    console.error(`   채널 ID: ${process.env.FORUM_CHANNEL_ID}`);
  }

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
          name: "target",
          description: "댓글 대상",
          type: 6,
          required: true,
        },
        {
          name: "writer",
          description: "댓글 작성자 (생략 시 명령 실행자)",
          type: 6,
          required: false,
        },
      ],
    },
  ];

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log("슬래시 커맨드 등록 중...");
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: commands },
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
      (m) => !m.user.bot && m.roles.cache.has(process.env.THIRD_GEN_ROLE_ID),
    )
    .map((m) => `<@${m.user.id}>`);

  console.log(`[makePairs] 매칭 대상 ${users.length}명`);

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

  console.log(`[makePairs] ${pairs.length}개 그룹 생성 완료`);
  return pairs;
}

/**
 * 페어 매칭 메시지 생성
 */
function createPairMessage(pairs, cycle) {
  let message = `🎉 **${cycle - 1}회차** 페어가 정해졌어요!\n\n`;
  pairs.forEach((group, i) => {
    const emoji = ["👥", "🤝", "💪", "✨", "🌟", "🚀"][i % 6];
    message += `${emoji} **그룹 ${i + 1}** (${group.length}명): ${group.join(
      ", ",
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

  console.log(
    `[커맨드] /${interaction.commandName} 실행 by ${interaction.user.username} (${interaction.user.id})`,
  );

  // /pair
  if (interaction.commandName === "pair") {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      const pairs = await makePairs(guild);
      const biweekStart = getBiweekStart();
      const cycle = getBiweekCycle(biweekStart);

      console.log(
        `[/pair] ${cycle - 1}회차, biweekStart=${biweekStart}, ${pairs.length}개 그룹`,
      );

      for (const [groupIndex, group] of pairs.entries()) {
        for (const mention of group) {
          const userId = mention.replace(/[<@>]/g, "");
          await appendRow("bot_pairs", [
            biweekStart,
            cycle,
            groupIndex + 1,
            userId,
          ]);
        }
      }

      console.log(`[/pair] 시트 기록 완료`);
      await interaction.editReply(createPairMessage(pairs, cycle));
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

    // 댓글은 이전 사이클(포스트 작성 기간)로 기록
    const currentBiweek = getBiweekStart();
    const prevDate = new Date(`${currentBiweek}T00:00:00Z`);
    prevDate.setDate(prevDate.getDate() - 1);
    const biweekStart = getBiweekStart(prevDate);
    const cycle = getBiweekCycle(biweekStart);

    // writer가 없으면 명령 실행자가 writer
    const writer = interaction.options.getUser("writer") ?? interaction.user;

    const target = interaction.options.getUser("target");
    const recordedBy = interaction.user;

    if (!target) {
      return interaction.editReply("⚠️ 댓글 대상이 지정되지 않았어요.");
    }

    const rows = await getRows("bot_weekly_comments");

    // same biweek + writer + target
    const already = rows.find(
      (r) => r[0] === biweekStart && r[2] === writer.id && r[3] === target.id,
    );

    if (already) {
      console.log(
        `[/comment] 중복 기록 - writer=${writer.username}, target=${target.username}, biweek=${biweekStart}`,
      );
      return interaction.editReply(
        "✅ 이미 이번 2주에 해당 댓글이 기록되어 있어요!",
      );
    }

    console.log(
      `[/comment] 기록 - writer=${writer.username}, target=${target.username}, cycle=${cycle}`,
    );
    await appendRow("bot_weekly_comments", [
      biweekStart,
      cycle,
      writer.id,
      target.id,
      recordedBy.id,
      new Date().toISOString(),
    ]);

    await interaction.editReply(
      `✍️ 댓글 기록 완료!\n\n- 작성자: ${writer.username}\n- 대상: ${target.username}`,
    );
    return;
  }
});

client.on("threadCreate", async (thread) => {
  console.log(
    `[threadCreate] 새 스레드 감지: "${thread.name}" (parentId=${thread.parentId})`,
  );

  if (thread.parentId !== process.env.FORUM_CHANNEL_ID) {
    console.log(
      `[threadCreate] 포럼 채널 아님, 스킵 (expected=${process.env.FORUM_CHANNEL_ID})`,
    );
    return;
  }

  const ownerId = thread.ownerId;
  if (!ownerId) {
    console.log(`[threadCreate] ownerId 없음, 스킵`);
    return;
  }

  const biweekStart = getBiweekStart(thread.createdAt);
  const cycle = getBiweekCycle(biweekStart);

  console.log(
    `[threadCreate] 포스트 기록 - user=${ownerId}, cycle=${cycle}, date=${thread.createdAt.toISOString()}`,
  );

  await appendRow("bot_weekly_posts", [
    biweekStart,
    cycle,
    ownerId,
    thread.createdAt.toISOString(),
  ]);

  console.log(`[threadCreate] 시트 기록 완료`);
});

/**
 * 매주 월요일 오전 10시 체크 (한국 시간)
 * 2주 주기가 변경된 경우에만 페어 매칭 실행
 */
cron.schedule(
  "0 10 * * 1",
  async () => {
    try {
      const currentBiweek = getBiweekStart();
      const previousBiweek = getBiweekStart(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      );

      console.log(
        `[cron:pair] 월요일 10시 체크 - current=${currentBiweek}, previous=${previousBiweek}`,
      );

      // 2주 주기가 변경된 월요일에만 실행
      if (currentBiweek === previousBiweek) {
        console.log("[cron:pair] 2주 주기 미변경, 페어 매칭 스킵");
        return;
      }

      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      const channel = await client.channels.fetch(process.env.PAIR_CHANNEL_ID);
      const pairs = await makePairs(guild);
      const cycle = getBiweekCycle(currentBiweek);

      console.log(
        `[cron:pair] ${cycle - 1}회차 페어 매칭 시작, ${pairs.length}개 그룹`,
      );

      for (const [groupIndex, group] of pairs.entries()) {
        for (const mention of group) {
          const userId = mention.replace(/[<@>]/g, "");
          await appendRow("bot_pairs", [
            currentBiweek,
            cycle,
            groupIndex + 1,
            userId,
          ]);
        }
      }

      const message = createPairMessage(pairs, cycle);

      await channel.send(message);
      console.log("[cron:pair] 자동 페어 매칭 완료 (격주 월요일 10시)");
    } catch (error) {
      console.error("[cron:pair] 자동 페어 매칭 실패:", error);
    }
  },
  { timezone: "Asia/Seoul" },
);

/**
 * 매주 화요일 밤 11시 59분 체크 (한국 시간)
 * 2주 주기가 변경된 경우에만 벌금 정산 실행
 */
cron.schedule(
  "59 23 * * 2",
  async () => {
    try {
      /* 1️⃣ 기준 2주 계산 */
      const currentBiweek = getBiweekStart();
      const previousWeekBiweek = getBiweekStart(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      );

      console.log(
        `[cron:fine] 화요일 23:59 체크 - current=${currentBiweek}, previousWeek=${previousWeekBiweek}`,
      );

      // 2주 주기가 변경되지 않았으면 스킵
      if (currentBiweek === previousWeekBiweek) {
        console.log("[cron:fine] 2주 주기 미변경, 벌금 정산 스킵");
        return;
      }

      // lastBiweek: 댓글 기간 / 포스트 마감 기준
      const lastBiweekDate = new Date(`${currentBiweek}T00:00:00Z`);
      lastBiweekDate.setDate(lastBiweekDate.getDate() - 1);
      const lastBiweek = getBiweekStart(lastBiweekDate);

      // postBiweek: 포스트 작성 기간 (정산 대상)
      const postBiweekDate = new Date(`${lastBiweek}T00:00:00Z`);
      postBiweekDate.setDate(postBiweekDate.getDate() - 1);
      const postBiweek = getBiweekStart(postBiweekDate);
      const settleCycle = getBiweekCycle(postBiweek);

      console.log(
        `[cron:fine] 정산 대상: ${settleCycle - 1}회차 (포스트: ${postBiweek}, 댓글/마감: ${lastBiweek})`,
      );

      /* 2️⃣ 데이터 조회 */
      const members = await getRows("bot_members");
      const comments = await getRows("bot_weekly_comments");
      const posts = await getRows("bot_weekly_posts");

      console.log(
        `[cron:fine] 데이터 조회 완료 - members=${members.length}, comments=${comments.length}, posts=${posts.length}`,
      );

      /* 3️⃣ 댓글 작성자 (postBiweek 기준으로 기록됨) */
      const commented = new Set(
        comments.filter((r) => r[0] === postBiweek).map((r) => r[2]),
      );

      /* 4️⃣ 포럼 포스트 */
      const { onTimeDeadline, lateDeadline } = getDeadlines(lastBiweek);

      const postMap = new Map();

      posts
        .filter((r) => {
          // postBiweek 기간에 작성된 포스트
          if (r[0] === postBiweek) return true;
          // 마감일(월)/지각(화)에 작성된 포스트 (lastBiweek으로 기록됨)
          if (r[0] === lastBiweek) {
            return new Date(r[3]) <= lateDeadline;
          }
          return false;
        })
        .forEach(([_, __, userId, createdAt]) => {
          const time = new Date(createdAt);
          if (!postMap.has(userId) || postMap.get(userId) > time) {
            postMap.set(userId, time);
          }
        });

      console.log(
        `[cron:fine] 댓글 작성자 ${commented.size}명, 포스트 작성자 ${postMap.size}명`,
      );
      console.log(
        `[cron:fine] 마감: onTime=${onTimeDeadline.toISOString()}, late=${lateDeadline.toISOString()}`,
      );

      /* 5️⃣ 사용자별 벌금 계산 */
      const fines = calculateFines(
        members,
        commented,
        postMap,
        onTimeDeadline,
        lateDeadline,
      );

      /* 7️⃣ 시트 기록 */
      for (const f of fines) {
        await appendRow("bot_fines", [
          postBiweek,
          settleCycle,
          f.userId,
          f.totalFine,
          f.reasons.join(", "),
          new Date().toISOString(),
        ]);
      }

      /* 8️⃣ 디스코드 알림 */
      if (fines.length > 0) {
        const channel = await client.channels.fetch(
          process.env.FINE_CHANNEL_ID,
        );

        const message =
          `💸 **${settleCycle - 1}회차** 벌금 정산 결과입니다.\n\n` +
          fines
            .map(
              (f) =>
                `- <@${f.userId}>: ${f.totalFine}원 (${f.reasons.join(" + ")})`,
            )
            .join("\n");

        await channel.send(message);
      }

      console.log(`[cron:fine] 벌금 처리 완료 - 대상 ${fines.length}명`);
      fines.forEach((f) =>
        console.log(
          `  - ${f.userId}: ${f.totalFine}원 (${f.reasons.join(", ")})`,
        ),
      );
    } catch (error) {
      console.error("[cron:fine] 벌금 cron 오류:", error);
    }
  },
  { timezone: "Asia/Seoul" },
);

console.log(`[시작] 봇 시작 시각: ${new Date().toISOString()}`);
console.log(
  `[시작] cron 등록: 페어 매칭(월 10:00 KST), 벌금 정산(화 23:59 KST)`,
);
client.login(process.env.DISCORD_TOKEN);
