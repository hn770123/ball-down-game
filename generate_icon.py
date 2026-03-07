from PIL import Image, ImageDraw

def create_pop_sphere_icon(filename="apple-touch-icon.png", size=180):
    # Create a new image with a light pink background
    image = Image.new("RGB", (size, size), color=(255, 228, 225)) # MistyRose background
    draw = ImageDraw.Draw(image)

    # Draw a pop colored sphere (e.g. vibrant cyan/blue)
    margin = 30
    bbox = [margin, margin, size - margin, size - margin]
    draw.ellipse(bbox, fill=(0, 206, 209), outline=(0, 139, 139), width=5)

    # Add a highlight to make it look like a sphere
    hl_margin_x1 = margin + 20
    hl_margin_y1 = margin + 20
    hl_margin_x2 = margin + 45
    hl_margin_y2 = margin + 45
    hl_bbox = [hl_margin_x1, hl_margin_y1, hl_margin_x2, hl_margin_y2]
    draw.ellipse(hl_bbox, fill=(255, 255, 255))

    image.save(filename)
    print(f"Saved {filename}")

if __name__ == "__main__":
    create_pop_sphere_icon()
