export default defineEventHandler(async (event) => {
  const b = await readBody(event)
  return createSprint(b?.repo || '', Array.isArray(b?.features) ? b.features : [])
})
