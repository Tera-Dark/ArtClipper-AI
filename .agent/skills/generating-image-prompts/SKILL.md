---
name: generating-image-prompts
description: Constructs detailed text prompts for AI image generators (Stable Diffusion, Midjourney, etc.). Use when the user wants to create art, generate images, or needs "tags" or "prompts" for visual ideas.
---

# Generating Image Prompts

## When to use this skill
- User asks for an AI painting prompt (e.g., "帮我写一个画图提示词").
- User describes a scene and asks for "tags" or "keywords".
- User specifies a style (e.g., "Cyberpunk", "Anime", "Photorealistic") and needs a prompt.

## Workflow
1.  **Analyze Request**: Identify subject, style, medium, lighting, composition, and specific constraints.
2.  **Translate (if needed)**: Convert key concepts to English, as most AI models perform best with English prompts.
3.  **Construct Prompt**: Assemble the prompt using standard best practices (Subject + Descriptors + Style + Parameters).
4.  **Format Output**: Present the prompt in a clear code block for easy copying.

## Instructions

### 1. Prompt Structure
Assemble prompts in this order:
`[Subject/Main Focus], [Action/Pose], [Environment/Background], [Lighting], [Style/Medium/Artist], [Technical Quality Tags], [Parameters]`

### 2. Keyword Categories (Heuristics)
*   **Quality**: `masterpiece, best quality, ultra-detailed, 8k, highres`
*   **Lighting**: `cinematic lighting, volumetric lighting, soft light, rim light, ray tracing`
*   **Composition**: `dynamic angle, close-up, wide shot, rule of thirds, depth of field`
*   **Styles**: `cyberpunk, steampunk, fantasy, sci-fi, oil painting, watercolor, sketch, photorealistic`

### 3. Handling Chinese Requests
*   If the user request is in Chinese, **REPLY IN CHINESE** to explain the prompt, but **GENERATE THE PROMPT ITSELF IN ENGLISH**.
*   Example:
    > 这是一个为您生成的赛博朋克风格提示词：
    > ```
    > cyberpunk city street, neon lights, raining, reflection on wet ground, futuristic skyscrapers, ultra-detailed, 8k, cinematic lighting --ar 16:9
    > ```

### 4. Special Parameters
*   **Midjourney**: Add `--v 6.0` or `--ar 16:9` if relevant.
*   **Stable Diffusion**: Suggest "Negative Prompts" if necessary (e.g., `(worst quality, low quality:1.4), deformity, bad anatomy`).

## Output Template
Always provide the final prompt in a code block.

**Example Output:**
```markdown
### AI 绘画提示词 (Stable Diffusion / Midjourney)

**Prompt:**
```text
[Insert English Prompt Here]
```

**Negative Prompt:** (Optional)
```text
[Insert Negative Prompt Here]
```
```
