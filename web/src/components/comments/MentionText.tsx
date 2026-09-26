import { Text } from '@mantine/core'

export function MentionText({ text }: { text: string }) {
  return (
    <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {text.split(/(@[\w-]+)/g).map((part, index) =>
        part.startsWith('@') ? (
          <Text key={index} span fw={600} c="green">
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  )
}
