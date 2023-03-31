const util = require("node:util");
const exec = util.promisify(require("node:child_process").exec);
const fs = require("node:fs/promises");
const readline = require("node:readline");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// text color
const green = "\u001b[32m";
const cyan = "\u001b[36m";
const reset = "\u001b[0m";

const narratorMap = {
  f1: "Japanese Female 1",
  f2: "Japanese Female 2",
  f3: "Japanese Female 3",
  m1: "Japanese Male 1",
  m2: "Japanese Male 2",
  m3: "Japanese Male 3",
  c: "Japanese Female Child",
};

const VOICEPEAK_PATH = "/Applications/voicepeak.app/Contents/MacOS/voicepeak";

async function speech(text, options) {
  if (!text) {
    throw new Error("Not found speech text");
  }

  // NOTE: options.voicepeakPath is not implemented
  const voicepeakPath = options?.voicepeakPath || VOICEPEAK_PATH;

  try {
    await exec(`${voicepeakPath} --help`);
  } catch (error) {
    throw new Error(`Command not found: ${error.message}`);
  }

  const vpOptions = ["-s", text];
  if (options?.narrator) {
    const narratorVoice = narratorMap[options.narrator];
    if (!narratorMap) {
      throw new Error("Invalid narrator voice");
    }

    vpOptions.unshift("--narrator", `"${narratorVoice}"`);
  }

  try {
    const vpCmd = `${voicepeakPath} ${vpOptions.join(" ")}`;
    await exec(vpCmd);
  } catch (error) {
    throw new Error(`voicepeak command failed: ${error.message}`);
  }

  try {
    const playCmd = "afplay output.wav";
    await exec(playCmd);
  } catch (error) {
    throw new Error(`Play wav file failed: ${error.message}`);
  }

  try {
    // Delete the created wav file.
    await fs.unlink("output.wav");
  } catch (error) {
    throw new Error(`Failed to delete output.wav: ${error.message}`);
  }
}

async function chat(messages) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Not found OPENAI_API_KEY");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const url = "https://api.openai.com/v1/chat/completions";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages,
    }),
  });

  const resJson = await res.json();
  const message = resJson.choices[0].message;
  return message;
}

function systemMessage(text) {
  console.log(green + text + reset);
}

function assistantMessage(text) {
  console.log(cyan + text + reset);
}

function textCount(text) {
  const segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });
  return [...segmenter.segment(text)].length;
}

function splitTextToChunks(string, maxLength = 140) {
  const result = [];
  let startIndex = 0;

  const textWithoutNewlines = string.replace(/\r?\n|\r/g, "");

  while (startIndex < textCount(textWithoutNewlines)) {
    const endIndex = startIndex + maxLength;
    const chunk = textWithoutNewlines.slice(startIndex, endIndex);
    result.push(chunk);
    startIndex = endIndex;
  }

  return result;
}

(async () => {
  // see: narratorMap
  const options = { narrator: "f1" };

  const messages = [];
  systemMessage(
    "どのようなチャットボットと会話をしたいですか？設定をまずは入力してください。",
  );

  rl.on("line", async (input) => {
    if (messages.length === 0) {
      messages.push({ role: "system", content: input });
      systemMessage("承知しました。それでは会話を始めましょう！");
    } else if (input === "さようなら") {
      try {
        const byeText = "さようなら！またお話をしましょう！";
        systemMessage(byeText);
        await speech(byeText, options);
      } catch (error) {
        console.error(error);
      }

      rl.close();
    } else {
      try {
        messages.push({ role: "user", content: input });
        const response = await chat(messages);
        assistantMessage(response.content);

        if (textCount(response.content) > 140) {
          const splitTexts = splitTextToChunks(response.content);
          for (const t of splitTexts) {
            await speech(t, options);
          }
        } else {
          await speech(response.content, options);
        }

        messages.push(response);
      } catch (error) {
        console.error(error);
      }
    }

    // DEBUG
    // console.log({ messages })
  });
})();
