// Public CodePen JavaScript panel, transcribed from extracted source.
// Author: mjchal. https://codepen.io/mjchal/pen/vYpaxOK
// MIT: see CODEPEN-LICENSE.txt. Requires the original HTML and CryptoJS.
// Not a captured production bundle; do not execute untrusted seed inputs as code.
import seedrandom from 'https://esm.sh/seedrandom@3.0.5'

document.getElementById('verify').onclick = () => {
  const serverSeed = document.getElementById('serverSeed').value
  const serverHash = document.getElementById('serverHash').value
  const clientSeed = document.getElementById('clientSeed').value
  const rows = ~~document.getElementById('rows').value

  if (!serverSeed) return error('Server seed is required')
  if (!serverHash) return error('Server hash is required')
  if (!clientSeed) return error('Client seed is required')

  const isHashValid = CryptoJS.SHA256(serverSeed.trim()).toString() === serverHash.trim()
  let path = []
  let outcome = 1

  const seed = `${serverSeed}:${clientSeed}`
  for (let round = 1; round <= rows; round++) {
    const randomNumber = seedrandom(`${seed}:${round}`)()
    const direction = randomNumber < 0.5 ? 'L' : 'R'
    if (direction == 'R') outcome++
    path.push(direction)
  }

  result.innerHTML = `<div class="text-center">
    <div class="font-bold my-2 uppercase text-xl">
      ${isHashValid
        ? '<div class="text-green-500">Game is valid</div>'
        : '<div class="text-red-500">Game is invalid</div>'}
    </div>
    ${isHashValid
      ? `<div class="text-gray-300">
        Server-side path: ${path.join('')}<br />
        Tile number: ${outcome}
      </div>`
      : ''}
  </div>`
}
