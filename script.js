const { Configuration, OpenAIApi } = require('openai')
const github = require('@actions/github')
const axios = require('axios')
const diff = require('diff')

const octokit = github.getOctokit(process.env.GH_TOKEN)
const context = github.context

const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_TOKEN
  })
)

const pullRequest = context.payload.pull_request

async function start () {
  
  const res = await axios.get(pullRequest.diff_url)
  
  const prBody = diff.parsePatch(res.data).map(block => 
    block.hunks.map(hunk => 
      hunk.lines
        .filter(line => line[0] === '+')
        .map(line => line.substring(1))
        .filter(line => line !== '')
        .reduce((acc, line) => acc + '\n' + line, '')
    ).join('\n\n')
  ).join('\n\n').trim()
  
  const rawResponse = await openai.createEdit({
    model: "text-davinci-edit-001",
    input: prBody,
    instruction: "fix all grammar mistakes, remove unecessary word clutter, remove redundant wording, dont add more words than needed, dont change the text meaning",
    temperature: 0.7,
    top_p: 1,
  })
  const response = rawResponse.data.choices[0].text.trim()
  
  const responseDiff = diff.diffLines(prBody, rawResponse.data.choices[0].text).map((part) => 
    part.added
      ? '+ ' + part.value
      : '- ' + part.value
  ).join('\n')
  
  await octokit.rest.issues.createComment({
    owner: pullRequest.user.login,
    repo: pullRequest.head.repo.name,
    issue_number: pullRequest.number,
    body: `GPT-powered suggestions: \n\`\`\`\n${responseDiff}\`\`\``,
  })
  
}

start()
