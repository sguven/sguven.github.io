/* CalorieLog demo: built-in food table used to read typed meals in the browser.
   Values are typical figures per serving, rounded (USDA-style references).
   v = [kcal, protein g, carbs g, fat g, fiber g, sugar g, sodium mg]
   g / ml = grams or millilitres in one serving; u = servings per named unit; ns = ignore size words */
(function () {
  var L = [];
  function F(aliases, name, noun, basis, o, v) { L.push({ a: aliases.split('|'), n: name, noun: noun, basis: basis, g: o.g, ml: o.ml, u: o.u || {}, ns: !!o.ns, v: v }); }

  /* Eggs and breakfast */
  F('egg|boiled egg|hard boiled egg|soft boiled egg|poached egg', 'Egg, boiled', 'egg', '1 large egg', { g: 50, ns: 1 }, [78, 6.3, 0.6, 5.3, 0, 0.6, 62]);
  F('fried egg|sunny side up egg|over easy egg', 'Egg, fried', 'egg', '1 large egg', { g: 46, ns: 1 }, [90, 6.3, 0.4, 7, 0, 0.2, 95]);
  F('scrambled egg', 'Egg, scrambled', 'egg', '1 large egg', { g: 61, ns: 1 }, [91, 6.1, 1, 6.7, 0, 0.8, 88]);
  F('omelette|omelet', 'Omelette', 'omelette', '2 eggs', { g: 130 }, [190, 13, 1.2, 15, 0, 0.8, 190]);
  F('cheese omelette|cheese omelet', 'Cheese omelette', 'omelette', '2 eggs and cheese', { g: 160 }, [300, 19, 1.5, 24, 0, 1, 420]);
  F('menemen', 'Menemen', 'portion', '1 portion', { g: 250 }, [250, 12, 10, 18, 2, 6, 500]);
  F('bacon|bacon strip|bacon slice', 'Bacon', 'strip', '1 strip', { g: 8, u: { slice: 1, strip: 1, piece: 1, rasher: 1 } }, [43, 3, 0.1, 3.3, 0, 0, 137]);
  F('sausage|sausage link|breakfast sausage', 'Sausage', 'link', '1 link', { g: 25, u: { link: 1, piece: 1 } }, [88, 4.5, 0.6, 7.5, 0, 0.3, 220]);
  F('pancake', 'Pancake', 'pancake', '1 medium pancake', { g: 40 }, [90, 2.5, 11, 3.8, 0.4, 2, 180]);
  F('waffle', 'Waffle', 'waffle', '1 waffle', { g: 75 }, [218, 6, 25, 10.6, 0.9, 4, 380]);
  F('french toast', 'French toast', 'slice', '1 slice', { g: 65, u: { slice: 1, piece: 1 } }, [150, 5, 16, 7, 0.6, 4, 210]);
  F('maple syrup|syrup', 'Maple syrup', 'tbsp', '1 tbsp', { ml: 15 }, [52, 0, 13.4, 0, 0, 12, 2]);
  F('oatmeal|porridge|oat', 'Oatmeal', 'bowl', '1 cup cooked', { g: 234, ml: 240, u: { bowl: 1, cup: 1 } }, [166, 5.9, 28, 3.6, 4, 0.6, 9]);
  F('granola', 'Granola', 'serving', '1/4 cup', { g: 30, u: { cup: 4, handful: 1 } }, [135, 3.5, 19, 5.5, 2, 6, 10]);
  F('cereal|cornflake|corn flake', 'Cereal', 'cup', '1 cup', { g: 30, u: { cup: 1, bowl: 1.5 } }, [110, 2, 25, 0.2, 1, 3, 200]);
  F('greek yogurt|greek yoghurt', 'Greek yogurt, plain', 'container', '1 container (170 g)', { g: 170, u: { cup: 1.4, bowl: 1.4 } }, [100, 17, 6, 0.7, 0, 6, 60]);
  F('yogurt|yoghurt', 'Yogurt, plain', 'container', '1 container (150 g)', { g: 150, u: { cup: 1.63, bowl: 1.63 } }, [92, 5.2, 7, 4.9, 0, 7, 69]);
  F('bagel', 'Bagel', 'bagel', '1 plain bagel', { g: 100 }, [270, 10.6, 53, 1.7, 2.3, 5, 430]);
  F('cream cheese', 'Cream cheese', 'serving', '2 tbsp', { g: 29, u: { tbsp: 0.5, tsp: 1 / 6, spoon: 0.5 } }, [99, 1.7, 1.6, 9.8, 0, 1, 90]);
  F('croissant', 'Croissant', 'croissant', '1 medium', { g: 57 }, [231, 4.7, 26, 12, 1.5, 6.4, 267]);
  F('muffin|blueberry muffin', 'Muffin', 'muffin', '1 bakery muffin', { g: 113 }, [380, 5.5, 52, 17, 1.5, 28, 330]);
  F('donut|doughnut|glazed donut', 'Donut, glazed', 'donut', '1 donut', { g: 60 }, [255, 3, 31, 14, 0.8, 12, 220]);
  F('toast|bread|white bread|white toast', 'Toast, white', 'slice', '1 slice', { g: 30, u: { slice: 1, piece: 1 } }, [80, 2.7, 15, 1, 0.8, 1.5, 150]);
  F('whole wheat toast|whole wheat bread|wheat toast|wheat bread|whole grain bread|whole grain toast|brown bread', 'Toast, whole wheat', 'slice', '1 slice', { g: 32, u: { slice: 1, piece: 1 } }, [80, 4, 13.8, 1.1, 1.9, 1.6, 140]);
  F('sourdough|sourdough bread|sourdough toast', 'Sourdough', 'slice', '1 slice', { g: 50, u: { slice: 1, piece: 1 } }, [130, 5, 25, 0.8, 1, 1, 280]);
  F('avocado toast', 'Avocado toast', 'slice', '1 slice', { g: 110, u: { slice: 1, piece: 1 } }, [260, 7, 26, 15, 8, 2, 330]);
  F('butter', 'Butter', 'serving', 'about 2 tsp', { g: 10, u: { tbsp: 1.4, tsp: 0.5, pat: 0.5, spoon: 1.4 } }, [72, 0.1, 0, 8.1, 0, 0, 64]);
  F('peanut butter', 'Peanut butter', 'serving', '2 tbsp', { g: 32, u: { tbsp: 0.5, tsp: 1 / 6, spoon: 0.5 } }, [188, 8, 6.3, 16, 1.9, 3, 147]);
  F('jam|jelly', 'Jam', 'tbsp', '1 tbsp', { g: 20, u: { tbsp: 1, tsp: 1 / 3, spoon: 1 } }, [56, 0.1, 13.8, 0, 0.2, 9.7, 6]);
  F('honey', 'Honey', 'tbsp', '1 tbsp', { g: 21, ml: 15, u: { tsp: 1 / 3, spoon: 1 } }, [64, 0.1, 17.3, 0, 0, 17.2, 1]);
  F('nutella|chocolate spread', 'Chocolate spread', 'tbsp', '1 tbsp', { g: 19, u: { tbsp: 1, tsp: 1 / 3, spoon: 1 } }, [100, 1, 11, 5.7, 0.5, 10.5, 8]);

  /* Fruit and vegetables */
  F('banana', 'Banana', 'banana', '1 medium', { g: 118 }, [105, 1.3, 27, 0.4, 3.1, 14.4, 1]);
  F('apple', 'Apple', 'apple', '1 medium', { g: 182 }, [95, 0.5, 25, 0.3, 4.4, 19, 2]);
  F('orange', 'Orange', 'orange', '1 medium', { g: 131 }, [62, 1.2, 15.4, 0.2, 3.1, 12.2, 0]);
  F('blueberry', 'Blueberries', 'cup', '1 cup', { g: 148, u: { cup: 1, handful: 0.33, bowl: 1 } }, [84, 1.1, 21, 0.5, 3.6, 14.7, 1]);
  F('strawberry', 'Strawberries', 'strawberry', '1 berry', { g: 12, u: { cup: 12, handful: 6, bowl: 12 } }, [4, 0.1, 0.9, 0, 0.2, 0.6, 0]);
  F('grape', 'Grapes', 'cup', '1 cup', { g: 151, u: { cup: 1, handful: 0.33, bowl: 1 } }, [104, 1.1, 27, 0.2, 1.4, 23, 3]);
  F('watermelon', 'Watermelon', 'cup', '1 cup diced', { g: 152, u: { cup: 1, slice: 2, wedge: 2, bowl: 2 } }, [46, 0.9, 11.5, 0.2, 0.6, 9.4, 2]);
  F('cherry tomato|grape tomato', 'Cherry tomatoes', 'tomato', '1 tomato', { g: 17, u: { cup: 9, handful: 5 } }, [3, 0.15, 0.7, 0, 0.2, 0.45, 1]);
  F('tomato', 'Tomato', 'tomato', '1 medium', { g: 123, u: { slice: 0.15 } }, [22, 1.1, 4.8, 0.2, 1.5, 3.2, 6]);
  F('cucumber', 'Cucumber', 'cup', '1 cup sliced', { g: 104, u: { cup: 1, slice: 0.07 } }, [16, 0.7, 3.8, 0.1, 0.5, 1.7, 2]);
  F('carrot', 'Carrot', 'carrot', '1 medium', { g: 61 }, [25, 0.6, 6, 0.1, 1.7, 2.9, 42]);
  F('baby carrot', 'Baby carrots', 'carrot', '1 baby carrot', { g: 10, u: { handful: 8, cup: 12 } }, [4, 0.1, 0.8, 0, 0.3, 0.5, 8]);
  F('broccoli', 'Broccoli', 'cup', '1 cup', { g: 91, u: { cup: 1, floret: 0.1, bowl: 2 } }, [31, 2.5, 6, 0.3, 2.4, 1.5, 30]);
  F('salad|side salad|green salad|garden salad|mixed green', 'Green salad, no dressing', 'bowl', '1 side bowl', { g: 100, u: { bowl: 1, plate: 1.5 } }, [20, 1.5, 4, 0.2, 1.8, 2, 25]);
  F('caesar salad', 'Caesar salad', 'bowl', '1 bowl', { g: 200, u: { bowl: 1, plate: 1 } }, [330, 9, 14, 27, 3, 3, 700]);
  F('chicken caesar salad|chicken caesar', 'Chicken Caesar salad', 'bowl', '1 bowl', { g: 300, u: { bowl: 1, plate: 1 } }, [470, 36, 15, 30, 3, 3, 1050]);
  F('potato|baked potato', 'Baked potato', 'potato', '1 medium', { g: 173 }, [161, 4.3, 37, 0.2, 3.8, 2, 17]);
  F('sweet potato', 'Sweet potato', 'potato', '1 medium', { g: 130 }, [112, 2, 26, 0.1, 3.9, 5.4, 72]);
  F('mashed potato', 'Mashed potatoes', 'cup', '1 cup', { g: 210, u: { cup: 1, scoop: 0.5, bowl: 1 } }, [214, 3.9, 35, 7, 3.2, 3, 630]);
  F('fries|french fries', 'French fries', 'serving', '1 medium serving', { g: 117, u: { order: 1, bag: 1, portion: 1 } }, [365, 4, 48, 17, 4.4, 0.3, 250]);
  F('potato chip|crisp', 'Potato chips', 'bag', '1 oz bag', { g: 28, u: { bag: 1, handful: 0.5 } }, [152, 2, 15, 10, 1.2, 0.1, 147]);
  F('tortilla chip', 'Tortilla chips', 'serving', '1 oz', { g: 28, u: { handful: 0.5, bag: 1, bowl: 2 } }, [140, 2, 18, 7, 1.5, 0.3, 120]);

  /* Protein */
  F('chicken|chicken breast|grilled chicken|grilled chicken breast|baked chicken|roast chicken', 'Chicken breast, grilled', 'serving', '4 oz cooked (113 g)', { g: 113, u: { breast: 1.5, piece: 1, fillet: 1.5 } }, [187, 35, 0, 4, 0, 0, 84]);
  F('fried chicken', 'Fried chicken', 'piece', '1 piece', { g: 140, u: { piece: 1 } }, [360, 34, 13, 19, 0.5, 0, 750]);
  F('chicken wing|wing|buffalo wing', 'Chicken wings', 'wing', '1 wing', { g: 32 }, [95, 7, 1, 7, 0, 0.2, 250]);
  F('chicken nugget|nugget', 'Chicken nuggets', 'nugget', '1 nugget', { g: 16 }, [48, 2.5, 3, 3, 0.2, 0, 90]);
  F('salmon|salmon fillet|grilled salmon|baked salmon', 'Salmon, cooked', 'fillet', '1 fillet (150 g)', { g: 150, u: { fillet: 1, piece: 1 } }, [309, 33, 0, 18.5, 0, 0, 90]);
  F('tuna|canned tuna', 'Tuna, canned', 'can', '1 can, drained', { g: 140, u: { can: 1 } }, [160, 35, 0, 1.4, 0, 0, 450]);
  F('shrimp|prawn', 'Shrimp', 'serving', '3 oz (85 g)', { g: 85, u: { piece: 0.13 } }, [84, 20, 0.2, 0.2, 0, 0, 95]);
  F('steak|sirloin|ribeye|beef steak', 'Steak', 'steak', '8 oz cooked', { g: 225 }, [490, 58, 0, 27, 0, 0, 120]);
  F('ground beef|beef', 'Beef', 'serving', '4 oz cooked', { g: 113 }, [280, 28, 0, 18, 0, 0, 90]);
  F('pork chop', 'Pork chop', 'chop', '1 chop', { g: 145 }, [290, 40, 0, 13, 0, 0, 90]);
  F('tofu', 'Tofu, firm', 'serving', '1/2 cup (126 g)', { g: 126, u: { cup: 2, block: 3.5 } }, [181, 21.8, 3.5, 11, 2.9, 0.8, 18]);
  F('lentil', 'Lentils, cooked', 'cup', '1 cup', { g: 198, u: { cup: 1, bowl: 1.5 } }, [230, 18, 40, 0.8, 15.6, 3.6, 4]);
  F('black bean|bean', 'Black beans', 'serving', '1/2 cup', { g: 86, u: { cup: 2, scoop: 1 } }, [114, 7.6, 20.4, 0.5, 7.5, 0.3, 200]);
  F('chickpea', 'Chickpeas', 'serving', '1/2 cup', { g: 82, u: { cup: 2 } }, [134, 7.3, 22.5, 2.1, 6.2, 3.9, 6]);
  F('cheese|cheddar|cheddar cheese|cheese slice', 'Cheddar cheese', 'slice', '1 slice (28 g)', { g: 28, u: { slice: 1, piece: 1 } }, [113, 7, 0.4, 9.3, 0, 0.1, 180]);
  F('feta|feta cheese|white cheese|beyaz peynir', 'Feta / white cheese', 'serving', '1 oz (28 g)', { g: 28, u: { slice: 1, piece: 1 } }, [75, 4, 1.2, 6, 0, 1.1, 323]);
  F('mozzarella', 'Mozzarella', 'serving', '1 oz (28 g)', { g: 28 }, [85, 6.3, 0.6, 6.3, 0, 0.3, 175]);
  F('parmesan', 'Parmesan', 'tbsp', '1 tbsp grated', { g: 5 }, [21, 1.9, 0.2, 1.4, 0, 0, 76]);
  F('cottage cheese', 'Cottage cheese', 'serving', '1/2 cup', { g: 113, u: { cup: 2 } }, [110, 12.5, 4, 5, 0, 3, 400]);
  F('hummus', 'Hummus', 'serving', '2 tbsp', { g: 30, u: { tbsp: 0.5, cup: 8, scoop: 2 } }, [70, 2, 4.3, 5, 1.8, 0.1, 115]);
  F('falafel', 'Falafel', 'piece', '1 piece', { g: 17 }, [57, 2.3, 5.4, 3, 1.4, 0.3, 50]);

  /* Grains and dishes */
  F('rice|white rice|steamed rice', 'Rice, white', 'cup', '1 cup cooked', { g: 158, u: { cup: 1, bowl: 1.5, scoop: 0.5, plate: 1.5 } }, [205, 4.3, 44.5, 0.4, 0.6, 0.1, 2]);
  F('brown rice', 'Rice, brown', 'cup', '1 cup cooked', { g: 195, u: { cup: 1, bowl: 1.5, scoop: 0.5 } }, [218, 4.5, 45.8, 1.6, 3.5, 0.7, 10]);
  F('fried rice', 'Fried rice', 'cup', '1 cup', { g: 137, u: { cup: 1, bowl: 2, plate: 2 } }, [238, 5.5, 45, 4, 1.4, 1, 530]);
  F('quinoa', 'Quinoa, cooked', 'cup', '1 cup', { g: 185, u: { cup: 1, bowl: 1.5 } }, [222, 8, 39, 3.6, 5, 1.6, 13]);
  F('couscous|bulgur|bulgur pilaf|pilav', 'Bulgur / couscous', 'cup', '1 cup cooked', { g: 170, u: { cup: 1, bowl: 1.5, plate: 1.5 } }, [180, 6, 37, 1, 6, 0.2, 10]);
  F('pasta|spaghetti|penne|macaroni|noodle', 'Pasta, cooked', 'cup', '1 cup', { g: 140, u: { cup: 1, bowl: 2, plate: 2 } }, [221, 8.1, 43, 1.3, 2.5, 0.8, 1]);
  F('spaghetti bolognese|pasta bolognese|bolognese', 'Spaghetti bolognese', 'plate', '1 plate', { g: 350, u: { plate: 1, bowl: 1 } }, [590, 30, 70, 20, 6, 10, 850]);
  F('mac and cheese|macaroni and cheese|mac n cheese', 'Mac and cheese', 'cup', '1 cup', { g: 200, u: { cup: 1, bowl: 1.5 } }, [380, 15, 40, 18, 1.5, 5, 850]);
  F('lasagna|lasagne', 'Lasagna', 'piece', '1 piece', { g: 250, u: { piece: 1, slice: 1 } }, [450, 26, 38, 21, 3, 8, 900]);
  F('pizza|cheese pizza|margherita|margherita pizza', 'Pizza, cheese', 'slice', '1 large slice', { g: 107, u: { slice: 1, piece: 1 } }, [285, 12, 36, 10, 2.5, 3.8, 640]);
  F('pepperoni pizza|pepperoni', 'Pizza, pepperoni', 'slice', '1 large slice', { g: 110, u: { slice: 1, piece: 1 } }, [300, 13, 34, 12, 2, 4, 700]);
  F('burger|hamburger', 'Hamburger', 'burger', '1 burger', { g: 200 }, [450, 25, 36, 22, 2, 8, 800]);
  F('cheeseburger', 'Cheeseburger', 'burger', '1 burger', { g: 220 }, [535, 30, 40, 28, 2, 9, 1000]);
  F('double cheeseburger', 'Double cheeseburger', 'burger', '1 burger', { g: 300 }, [760, 45, 42, 45, 2, 9, 1400]);
  F('hot dog', 'Hot dog', 'hot dog', '1 with bun', { g: 100 }, [290, 10, 24, 17, 1, 4, 780]);
  F('sandwich|turkey sandwich', 'Turkey sandwich', 'sandwich', '1 sandwich', { g: 220 }, [350, 24, 35, 11, 3, 5, 1100]);
  F('ham sandwich', 'Ham sandwich', 'sandwich', '1 sandwich', { g: 220 }, [340, 20, 35, 12, 2.5, 5, 1250]);
  F('grilled cheese|grilled cheese sandwich', 'Grilled cheese', 'sandwich', '1 sandwich', { g: 150 }, [440, 16, 32, 28, 1.5, 4, 950]);
  F('pb and j|pbj|peanut butter and jelly|peanut butter and jelly sandwich|peanut butter sandwich', 'PB&J sandwich', 'sandwich', '1 sandwich', { g: 130 }, [380, 13, 47, 17, 4, 20, 450]);
  F('blt', 'BLT sandwich', 'sandwich', '1 sandwich', { g: 180 }, [450, 16, 30, 29, 2, 4, 950]);
  F('club sandwich', 'Club sandwich', 'sandwich', '1 sandwich', { g: 280 }, [590, 32, 45, 30, 3, 6, 1500]);
  F('wrap|chicken wrap', 'Chicken wrap', 'wrap', '1 wrap', { g: 250 }, [480, 30, 45, 19, 3, 4, 1100]);
  F('burrito|chicken burrito', 'Chicken burrito', 'burrito', '1 burrito', { g: 400 }, [750, 40, 90, 25, 12, 4, 1800]);
  F('burrito bowl|chicken burrito bowl', 'Chicken burrito bowl', 'bowl', '1 bowl', { g: 450 }, [650, 45, 70, 18, 14, 4, 1600]);
  F('taco|chicken taco', 'Chicken taco', 'taco', '1 taco', { g: 100 }, [190, 13, 17, 7.5, 2, 1.5, 350]);
  F('beef taco', 'Beef taco', 'taco', '1 taco', { g: 100 }, [210, 10, 15, 12, 2, 1, 380]);
  F('quesadilla|chicken quesadilla', 'Chicken quesadilla', 'quesadilla', '1 quesadilla', { g: 220 }, [520, 30, 38, 28, 2, 3, 1100]);
  F('sushi|nigiri', 'Sushi, nigiri', 'piece', '1 piece', { g: 40 }, [50, 2.7, 7, 0.5, 0.1, 1, 150]);
  F('california roll|sushi roll|maki', 'Sushi roll', 'roll', '1 roll (8 pieces)', { g: 220, u: { piece: 0.125 } }, [255, 9, 38, 7, 3, 6, 430]);
  F('ramen', 'Ramen', 'bowl', '1 bowl', { g: 550 }, [550, 20, 70, 20, 3, 4, 1900]);
  F('pad thai', 'Pad thai', 'plate', '1 plate', { g: 400 }, [650, 25, 80, 25, 4, 20, 1500]);
  F('pho', 'Pho', 'bowl', '1 bowl', { g: 600 }, [450, 30, 60, 8, 2, 6, 1600]);
  F('curry|chicken curry', 'Chicken curry', 'cup', '1 cup', { g: 240, u: { bowl: 1.5, plate: 1.5 } }, [300, 25, 10, 18, 2, 4, 700]);
  F('soup|chicken noodle soup|chicken soup', 'Chicken noodle soup', 'cup', '1 cup', { ml: 240, u: { bowl: 1.5, cup: 1 } }, [90, 6, 10, 2.5, 1, 1, 700]);
  F('tomato soup', 'Tomato soup', 'cup', '1 cup', { ml: 240, u: { bowl: 1.5, cup: 1 } }, [90, 2, 17, 2, 1.5, 10, 700]);
  F('lentil soup|mercimek|mercimek corbasi|mercimek çorbası', 'Lentil soup', 'bowl', '1 bowl (300 ml)', { ml: 300, u: { bowl: 1, cup: 0.8 } }, [180, 10, 28, 3.5, 8, 3, 650]);
  F('doner|döner|doner kebab|döner kebab|doner wrap|durum|dürüm|gyro', 'Döner wrap', 'wrap', '1 wrap', { g: 350 }, [650, 35, 55, 30, 4, 4, 1500]);
  F('kebab|shish kebab|chicken kebab|adana kebab|adana', 'Kebab', 'portion', '1 portion (meat only)', { g: 200, u: { skewer: 0.5 } }, [420, 35, 6, 28, 1, 2, 700]);
  F('lahmacun', 'Lahmacun', 'piece', '1 piece', { g: 160 }, [280, 12, 40, 8, 3, 3, 600]);
  F('pide', 'Pide', 'piece', '1 piece', { g: 300 }, [600, 25, 75, 22, 3, 4, 1100]);
  F('simit', 'Simit', 'simit', '1 simit', { g: 120 }, [320, 10, 55, 7, 3, 4, 500]);
  F('borek|börek', 'Börek', 'piece', '1 piece', { g: 100 }, [310, 9, 27, 18, 1, 1, 450]);
  F('baklava', 'Baklava', 'piece', '1 piece', { g: 40 }, [165, 2.5, 18, 10, 1, 10, 100]);

  /* Drinks */
  F('coffee|black coffee|americano|drip coffee|filter coffee', 'Coffee, black', 'cup', '1 cup', { ml: 240, u: { mug: 1.4 } }, [2, 0.3, 0, 0, 0, 0, 5]);
  F('espresso', 'Espresso', 'shot', '1 shot', { ml: 30 }, [3, 0.1, 0.5, 0.1, 0, 0, 4]);
  F('latte|cafe latte|caffe latte', 'Latte, 2% milk', 'latte', '12 oz', { ml: 355 }, [150, 10, 15, 6, 0, 14, 130]);
  F('oat milk latte|oat latte', 'Latte, oat milk', 'latte', '12 oz', { ml: 355 }, [180, 4, 25, 7, 1.5, 12, 150]);
  F('cappuccino', 'Cappuccino', 'cappuccino', '12 oz', { ml: 355 }, [120, 8, 12, 4.5, 0, 11, 100]);
  F('flat white', 'Flat white', 'flat white', '8 oz', { ml: 240 }, [110, 6, 9, 6, 0, 9, 80]);
  F('iced coffee', 'Iced coffee with milk', 'cup', '16 oz', { ml: 473 }, [80, 2, 12, 2, 0, 11, 40]);
  F('tea|black tea|green tea|turkish tea|cay|çay', 'Tea', 'cup', '1 cup', { ml: 240 }, [2, 0, 0.5, 0, 0, 0, 5]);
  F('sugar|sugar cube', 'Sugar', 'tsp', '1 tsp', { g: 4, u: { cube: 1, tsp: 1, tbsp: 3, spoon: 1 } }, [16, 0, 4, 0, 0, 4, 0]);
  F('milk', 'Milk, 2%', 'cup', '1 cup', { ml: 240 }, [122, 8, 12, 4.8, 0, 12, 115]);
  F('whole milk', 'Milk, whole', 'cup', '1 cup', { ml: 240 }, [149, 7.7, 11.7, 7.9, 0, 12.3, 105]);
  F('skim milk', 'Milk, skim', 'cup', '1 cup', { ml: 240 }, [83, 8.3, 12, 0.2, 0, 12, 103]);
  F('oat milk', 'Oat milk', 'cup', '1 cup', { ml: 240 }, [120, 3, 16, 5, 2, 7, 100]);
  F('orange juice|oj|juice', 'Orange juice', 'cup', '1 cup', { ml: 240 }, [112, 1.7, 26, 0.5, 0.5, 21, 2]);
  F('apple juice', 'Apple juice', 'cup', '1 cup', { ml: 240 }, [114, 0.2, 28, 0.3, 0.5, 24, 10]);
  F('cola|coke|soda|pepsi|soft drink', 'Cola', 'can', '12 oz can', { ml: 355, u: { can: 1 } }, [140, 0, 39, 0, 0, 39, 45]);
  F('diet coke|diet soda|coke zero|diet cola|diet pepsi', 'Diet cola', 'can', '12 oz can', { ml: 355, u: { can: 1 } }, [0, 0, 0, 0, 0, 0, 40]);
  F('beer', 'Beer', 'beer', '12 oz', { ml: 355, u: { can: 1, bottle: 1, pint: 1.33 } }, [153, 1.6, 12.6, 0, 0, 0, 14]);
  F('wine|red wine|white wine', 'Wine', 'glass', '5 oz glass', { ml: 148, u: { glass: 1 } }, [123, 0.1, 3.8, 0, 0, 1, 6]);
  F('smoothie|fruit smoothie', 'Fruit smoothie', 'smoothie', '16 oz', { ml: 473 }, [280, 4, 64, 1.5, 5, 50, 40]);
  F('protein shake|whey shake|whey', 'Protein shake', 'scoop', '1 scoop in water', { u: { scoop: 1 } }, [120, 24, 3, 1.5, 0, 1, 150]);
  F('kombucha', 'Kombucha', 'bottle', '1 bottle (16 oz)', { ml: 473, u: { bottle: 1, can: 0.75 } }, [60, 0, 14, 0, 0, 12, 20]);
  F('ayran', 'Ayran', 'glass', '1 glass (250 ml)', { ml: 250, u: { glass: 1 } }, [85, 4.5, 6, 4.5, 0, 6, 400]);
  F('water|sparkling water|seltzer', 'Water', 'glass', '1 glass', { ml: 250 }, [0, 0, 0, 0, 0, 0, 0]);

  /* Snacks, sweets and extras */
  F('almond', 'Almonds', 'almond', '1 almond', { g: 1.2, u: { handful: 23, cup: 115 } }, [7, 0.25, 0.25, 0.6, 0.15, 0.05, 0]);
  F('walnut', 'Walnuts', 'serving', '1 oz', { g: 28, u: { handful: 1 } }, [185, 4.3, 3.9, 18.5, 1.9, 0.7, 1]);
  F('cashew', 'Cashews', 'serving', '1 oz', { g: 28, u: { handful: 1 } }, [157, 5.2, 8.6, 12.4, 0.9, 1.7, 3]);
  F('peanut', 'Peanuts', 'serving', '1 oz', { g: 28, u: { handful: 1 } }, [161, 7.3, 4.6, 14, 2.4, 1.3, 5]);
  F('mixed nut|nut|trail mix', 'Mixed nuts', 'serving', '1 oz', { g: 28, u: { handful: 1 } }, [173, 5, 6, 15, 2, 1.5, 90]);
  F('protein bar', 'Protein bar', 'bar', '1 bar', { g: 60 }, [210, 20, 22, 7, 3, 5, 200]);
  F('granola bar', 'Granola bar', 'bar', '1 bar', { g: 42 }, [190, 4, 29, 7, 2, 11, 120]);
  F('popcorn', 'Popcorn', 'serving', '3 cups popped', { g: 24, u: { cup: 1 / 3, bowl: 1.3, bag: 1.2 } }, [93, 3, 18.6, 1.1, 3.5, 0.2, 2]);
  F('dark chocolate', 'Dark chocolate', 'square', '1 square (10 g)', { g: 10, u: { square: 1, piece: 1, bar: 10 } }, [60, 0.8, 4.6, 4.3, 1.1, 2.4, 2]);
  F('chocolate|chocolate bar|milk chocolate|candy bar', 'Chocolate bar', 'bar', '1 bar (43 g)', { g: 43, u: { bar: 1, square: 0.1, piece: 0.25 } }, [235, 3.3, 26, 13, 1.5, 22, 35]);
  F('cookie|chocolate chip cookie', 'Chocolate chip cookie', 'cookie', '1 cookie', { g: 35 }, [160, 2, 22, 8, 0.8, 13, 110]);
  F('ice cream', 'Ice cream', 'scoop', '1 scoop (1/2 cup)', { g: 66, u: { scoop: 1, cup: 2, bowl: 2 } }, [137, 2.3, 15.6, 7.3, 0.5, 14, 53]);
  F('cake|chocolate cake|cheesecake', 'Cake', 'slice', '1 slice', { g: 95, u: { slice: 1, piece: 1 } }, [370, 5, 50, 17, 2, 36, 330]);
  F('brownie', 'Brownie', 'brownie', '1 brownie', { g: 56 }, [230, 3, 30, 12, 1.2, 20, 150]);
  F('pretzel', 'Pretzels', 'serving', '1 oz', { g: 28, u: { handful: 1, bag: 1 } }, [108, 2.9, 22.5, 0.8, 0.9, 0.8, 385]);
  F('cracker', 'Crackers', 'cracker', '1 cracker', { g: 3, u: { handful: 8 } }, [16, 0.3, 2.2, 0.6, 0.1, 0.2, 30]);
  F('rice cake', 'Rice cake', 'rice cake', '1 cake', { g: 9 }, [35, 0.7, 7.3, 0.3, 0.4, 0.1, 25]);
  F('olive', 'Olives', 'olive', '1 olive', { g: 4, u: { handful: 8 } }, [5, 0, 0.3, 0.5, 0.1, 0, 60]);
  F('avocado', 'Avocado', 'avocado', '1 whole', { g: 200 }, [322, 4, 17, 29.5, 13.5, 1.3, 14]);
  F('guacamole|guac', 'Guacamole', 'serving', '1/4 cup', { g: 60, u: { cup: 4, tbsp: 0.25, scoop: 1, side: 1 } }, [100, 1.2, 5.3, 9, 4, 0.4, 170]);
  F('pita|pita bread', 'Pita bread', 'pita', '1 pita', { g: 60 }, [165, 5.5, 33, 0.7, 1.3, 0.8, 320]);
  F('olive oil', 'Olive oil', 'tbsp', '1 tbsp', { ml: 15, u: { tbsp: 1, tsp: 1 / 3, spoon: 1 } }, [119, 0, 0, 13.5, 0, 0, 0]);
  F('ranch|ranch dressing', 'Ranch dressing', 'serving', '2 tbsp', { g: 30, u: { tbsp: 0.5 } }, [129, 0.4, 1.8, 13.4, 0, 1.4, 270]);
  F('dressing|vinaigrette|salad dressing', 'Salad dressing', 'serving', '2 tbsp', { g: 30, u: { tbsp: 0.5 } }, [120, 0, 4, 11, 0, 3, 250]);
  F('ketchup', 'Ketchup', 'tbsp', '1 tbsp', { g: 17 }, [20, 0.2, 5, 0, 0, 4, 150]);
  F('mayo|mayonnaise', 'Mayonnaise', 'tbsp', '1 tbsp', { g: 14 }, [94, 0.1, 0.1, 10.3, 0, 0.1, 88]);
  F('soy sauce', 'Soy sauce', 'tbsp', '1 tbsp', { ml: 15 }, [9, 1.3, 0.8, 0, 0.1, 0.1, 880]);
  F('salsa', 'Salsa', 'serving', '2 tbsp', { g: 32, u: { tbsp: 0.5 } }, [10, 0.5, 2, 0, 0.5, 1, 200]);
  F('sour cream', 'Sour cream', 'serving', '2 tbsp', { g: 24, u: { tbsp: 0.5 } }, [60, 0.7, 1.4, 5.8, 0, 0.5, 15]);

  window.CL_FOODS = L;
})();
